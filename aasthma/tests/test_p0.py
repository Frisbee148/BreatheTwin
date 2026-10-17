import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from aasthma.server import app
from aasthma import server as server_module
from aasthma.inference.inference_engine import InferenceEngine
from aasthma.llm.llm import build_patient_copilot_payload, generate_copilot_report
from aasthma.simulation.clock import SimulationClock, global_clock
from aasthma.simulation.mechanistic_simulator import MechanisticSimulator


@pytest.fixture(scope="session")
def engine():
    return InferenceEngine()


@pytest.fixture(scope="session")
def simulator():
    return MechanisticSimulator()


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


# FR-1 & FR-2: Cohort Data Loading
def test_fr1_fr2_cohort_loading(engine):
    assert len(engine.patients_df) >= 10
    assert len(engine.patient_ids) >= 10
    assert "patient_id" in engine.patients_df.columns
    assert "timestamp_hour" in engine.ts_df.columns
    assert len(engine.static_feature_names) == 60
    assert len(engine.ts_feature_names) == 20


# FR-4: Simulation Clock Replay
def test_fr4_simulation_clock(engine):
    clock = SimulationClock(initial_hour=168)
    time_info = clock.get_time_info()
    assert time_info["current_hour"] == 168
    assert time_info["day_number"] == 8
    
    # Step forward 24h
    new_h = clock.step(24)
    assert new_h == 192
    assert clock.get_time_info()["day_number"] == 9

    # Filter telemetry for PT-8821
    resolved_pid = engine.resolve_patient_id("PT-8821")
    p_ts = engine.ts_df[engine.ts_df["patient_id"] == resolved_pid]
    daily = clock.aggregate_daily_telemetry(p_ts)
    assert len(daily) == 9
    assert daily[-1]["dayShort"] == "D9"
    assert "spo2" in daily[-1]
    assert "inflammationState" in daily[-1]


# FR-5: 24h & 48h Neural Risk Forecasting & Conformal Calibration
def test_fr5_neural_forecast(engine):
    pred = engine.predict_patient("PT-8821", end_hour=168)
    assert "risk24h" in pred
    assert "risk48h" in pred
    assert 0.0 <= pred["risk24h"] <= 100.0
    assert 0.0 <= pred["risk48h"] <= 100.0

    # Conformal Intervals
    ci_24 = pred["risk24hInterval"]
    ci_48 = pred["risk48hInterval"]
    assert len(ci_24) == 2 and ci_24[0] <= ci_24[1]
    assert len(ci_48) == 2 and ci_48[0] <= ci_48[1]
    assert pred["riskLevel"] in ["NORMAL", "CAUTION", "ELEVATED", "HIGH RISK"]


# FR-6: Ranked Alert Reasons (SHAP Feature Attributions)
def test_fr6_shap_feature_attributions(engine):
    pred = engine.predict_patient("PT-8821", end_hour=168)
    reasons = pred["shapReasons"]
    assert len(reasons) >= 3
    for r in reasons:
        assert "rank" in r
        assert "feature" in r
        assert "impactPercent" in r
        assert r["targetStream"] in ["AIR_QUALITY", "WEARABLE", "EHR", "MEDICATION"]


def test_copilot_payload_uses_patient_model_and_hourly_telemetry(engine):
    payload = build_patient_copilot_payload(engine, "PT-8821", end_hour=168)

    assert payload["patient_baseline_profile"]["patient_id"] == "PT-8821"
    assert payload["patient_baseline_profile"]["smoking_status"]
    assert 0.0 <= payload["model_predictions"]["risk_24h_pct"] <= 100.0
    assert 0.0 <= payload["model_predictions"]["risk_48h_pct"] <= 100.0
    assert payload["model_predictions"]["severity_class"] in range(4)
    assert payload["recent_telemetry_summary"]["duration_hours"] == 12
    metrics = payload["recent_telemetry_summary"]["hourly_metrics"]
    assert "mean" in metrics["cough_severity"]
    assert "mean" in metrics["wheezing_score"]


def test_copilot_report_endpoint_returns_patient_report(client, monkeypatch):
    expected_report = {
        "patient_id": "PT-8821",
        "clinical_status": "Warning",
        "risk_level": "Medium",
        "summary_reason": "Report grounded in the backend forecast.",
        "precautions": [],
        "triggers_to_avoid": [],
        "breathing_exercise": None,
        "medication_guidance": {
            "action": "No medication changes recommended.",
            "note": "Follow the clinician-approved plan.",
        },
        "emergency_warning": "Seek urgent assessment for severe symptoms.",
    }
    captured_payload = {}

    def fake_generate_report(payload):
        captured_payload.update(payload)
        return expected_report

    monkeypatch.setattr(server_module, "generate_copilot_report", fake_generate_report)
    response = client.post("/api/patients/PT-8821/copilot-report?hour=168")

    assert response.status_code == 200
    assert response.json() == expected_report
    assert captured_payload["patient_baseline_profile"]["patient_id"] == "PT-8821"
    assert captured_payload["evaluation_hour"] == 168


def test_copilot_report_validates_model_category_and_removes_treatment_advice(monkeypatch):
    provider_report = {
        "patient_id": "PT-8821",
        "clinical_status": "High Risk",
        "risk_level": "High",
        "summary_reason": "The model returned a high-risk forecast.",
        "precautions": [],
        "triggers_to_avoid": [],
        "breathing_exercise": {
            "name": "Example",
            "purpose": "Example",
            "how_to_do_it": ["Example"],
            "duration": "Example",
        },
        "medication_guidance": {
            "action": "Increase medication dose.",
            "note": "Example dose.",
        },
        "emergency_warning": "Seek urgent assessment for severe symptoms.",
    }
    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=json.dumps(provider_report))
            )
        ]
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=lambda **_: completion)
        )
    )
    import openai

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai, "OpenAI", lambda **_: fake_client)

    report = generate_copilot_report(
        {
            "patient_baseline_profile": {"patient_id": "PT-8821"},
            "model_predictions": {"risk_level": "HIGH RISK"},
        }
    )

    assert report["breathing_exercise"] is None
    assert report["medication_guidance"]["action"] == (
        "No medication change is recommended by this AI-generated report."
    )


# FR-7: Mechanistic Counterfactual What-If Sandbox
def test_fr7_mechanistic_counterfactual(simulator):
    # Aarush Sen baseline: 82% risk
    result = simulator.simulate_what_if(
        base_risk_48h=82.0,
        base_inflammation=0.84,
        current_pm25=184.0,
        current_adherence_pct=68.0,
        outdoor_hours=1.0,        # Reduced outdoor exposure
        wear_n95=True,            # N95 mask
        target_adherence_pct=100.0, # Full adherence
        hepa_purifier=True,       # HEPA purifier
    )
    assert "simulated_risk_48h" in result
    assert "risk_delta" in result
    assert result["risk_delta"] < 0  # Risk should drop
    assert result["simulated_risk_48h"] < 82.0
    assert result["simulated_inflammation"] < 0.84
    assert len(result["recommendations"]) > 0


# FR-8: FastAPI Doctor Dashboard Integration Endpoints
def test_fr8_fastapi_endpoints(client):
    # Health check
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # Simulation clock
    res = client.get("/api/clock")
    assert res.status_code == 200
    assert "current_hour" in res.json()

    # Step clock
    res = client.post("/api/clock/step", json={"hours": 12})
    assert res.status_code == 200

    # Cohort list
    res = client.get("/api/patients?limit=6")
    assert res.status_code == 200
    cohort = res.json()
    assert len(cohort) == 6
    assert any(p["id"] == "PT-8821" for p in cohort)

    # Patient detail
    res = client.get("/api/patients/PT-8821")
    assert res.status_code == 200
    patient = res.json()
    assert patient["id"] == "PT-8821"
    assert "currentTelemetry" in patient
    assert "currentAirQuality" in patient
    assert "shapReasons" in patient

    # Telemetry stream
    res = client.get("/api/patients/PT-8821/telemetry")
    assert res.status_code == 200
    data = res.json()
    assert "points" in data
    assert len(data["points"]) > 0

    # What-If API endpoint
    res = client.post("/api/what-if", json={
        "patient_id": "PT-8821",
        "base_risk_48h": 82.0,
        "base_inflammation": 0.84,
        "current_pm25": 184.0,
        "current_adherence_pct": 68.0,
        "outdoor_hours": 1.0,
        "wear_n95": True,
        "target_adherence_pct": 95.0,
        "hepa_purifier": True
    })
    assert res.status_code == 200
    what_if = res.json()
    assert what_if["risk_delta"] < 0

    # Clinical assumptions & benchmarks
    res = client.get("/api/assumptions")
    assert res.status_code == 200
    assert len(res.json()) >= 7

    res = client.get("/api/benchmarks")
    assert res.status_code == 200
    assert len(res.json()) >= 7
