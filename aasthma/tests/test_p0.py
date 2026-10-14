import pytest
from fastapi.testclient import TestClient

from aasthma.server import app
from aasthma.inference.inference_engine import InferenceEngine
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
