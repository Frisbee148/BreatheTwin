import json
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
import torch
from fastapi.testclient import TestClient

from aasthma.server import app
from aasthma import server as server_module
from aasthma.inference.inference_engine import InferenceEngine
from aasthma.llm.llm import build_patient_copilot_payload, generate_copilot_report
from aasthma.training.ensemble import (
    RespiTwinMLPMetaLearner,
    build_boosting_features,
)
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
    assert pred["ensemble"] == {
        "tcn": True,
        "gradient_boosting": True,
        "meta_learner": True,
    }


def test_ensemble_feature_builder_and_meta_model_shapes():
    static_names = ["age", "bmi"]
    dynamic_name = "spo2"
    feature_cols = static_names + [
        f"{dynamic_name}_mean",
        f"{dynamic_name}_std",
        f"{dynamic_name}_min",
        f"{dynamic_name}_max",
        f"{dynamic_name}_delta",
        *(f"{dynamic_name}_t_shift_{shift:+d}" for shift in range(-2, 3)),
    ]
    config = {
        "static_mean": pd.Series([0.0, 0.0], index=static_names),
        "ts_mean": pd.Series([0.0], index=[dynamic_name]),
        "ts_std": pd.Series([1.0], index=[dynamic_name]),
        "feature_cols": feature_cols,
    }
    features = build_boosting_features(
        np.asarray([[1.0, 2.0]], dtype=np.float32),
        np.arange(12, dtype=np.float32).reshape(1, 12, 1),
        config,
    )
    assert features.shape == (1, 12)
    assert np.array_equal(features[0, :2], [1.0, 2.0])

    model = RespiTwinMLPMetaLearner()
    risk_24h, risk_48h, severity = model(torch.zeros((2, 12)))
    assert risk_24h.shape == (2,)
    assert risk_48h.shape == (2,)
    assert severity.shape == (2, 4)


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


def test_patient_rag_chat_endpoint_and_guardrails(client):
    # 1. Plain-language forecast question
    res = client.post(
        "/api/patients/PT-8821/chat?hour=168",
        json={"question": "Why is my status at this level today and what is the air quality like?"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["patient_id"] == "PT-8821"
    assert body["plain_risk_level"] in ["Low", "Watch", "High"]
    assert body["medication_guardrail_triggered"] is False
    assert "%" not in body["answer"]
    assert len(body["rag_sources"]) >= 2
    assert len(body["key_takeaways"]) >= 2

    # 2. Medication adjustment guardrail test
    res_med = client.post(
        "/api/patients/PT-8821/chat?hour=168",
        json={"question": "Should I double my steroid dose or change my medication tonight?"},
    )
    assert res_med.status_code == 200
    med_body = res_med.json()
    assert med_body["medication_guardrail_triggered"] is True
    assert "cannot recommend changing" in med_body["answer"].lower()
    assert "%" not in med_body["answer"]


def test_postgres_dual_auth_signup_verify_and_login(client):
    import uuid
    unique_tag = uuid.uuid4().hex[:8]
    doc_email = f"dr.{unique_tag}@synclave.health"
    pat_email = f"pt.{unique_tag}@synclave.health"

    # 1. Doctor Sign Up -> stores unverified entry in PostgreSQL with 6-digit verification code
    res_doc_signup = client.post(
        "/api/auth/signup",
        json={
            "email": doc_email,
            "full_name": "Dr. Test Pulmonologist",
            "role": "doctor",
            "password": "docpass123",
            "license_or_clinic": "MD-TEST-100",
        },
    )
    assert res_doc_signup.status_code == 200
    doc_signup_body = res_doc_signup.json()
    assert doc_signup_body["status"] == "verification_required"
    doc_code = doc_signup_body["account"]["verification_code"]
    assert len(doc_code) == 6
    assert doc_signup_body["account"]["is_verified"] is False

    # Unverified login should be rejected
    res_unverified = client.post(
        "/api/auth/login",
        json={"email": doc_email, "password": "docpass123", "role": "doctor"},
    )
    assert res_unverified.status_code == 401

    # 2. Verify Doctor Code in PostgreSQL
    res_doc_verify = client.post(
        "/api/auth/verify",
        json={"email": doc_email, "verification_code": doc_code},
    )
    assert res_doc_verify.status_code == 200
    assert res_doc_verify.json()["account"]["is_verified"] is True

    # 3. Doctor Login succeeds
    res_doc_login = client.post(
        "/api/auth/login",
        json={"email": doc_email, "password": "docpass123", "role": "doctor"},
    )
    assert res_doc_login.status_code == 200
    assert res_doc_login.json()["account"]["role"] == "doctor"

    # 4. Patient Sign Up, Verify, and Login in PostgreSQL
    res_pat_signup = client.post(
        "/api/auth/signup",
        json={
            "email": pat_email,
            "full_name": "Test Patient User",
            "role": "patient",
            "password": "patpass123",
            "patient_id": "PT-8821",
        },
    )
    assert res_pat_signup.status_code == 200
    pat_code = res_pat_signup.json()["account"]["verification_code"]

    res_pat_verify = client.post(
        "/api/auth/verify",
        json={"email": pat_email, "verification_code": pat_code},
    )
    assert res_pat_verify.status_code == 200
    assert res_pat_verify.json()["account"]["is_verified"] is True

    res_pat_login = client.post(
        "/api/auth/login",
        json={"email": pat_email, "password": "patpass123", "role": "patient"},
    )
    assert res_pat_login.status_code == 200
    assert res_pat_login.json()["account"]["patient_id"] == "PT-8821"


def test_new_patient_enrollment_runs_full_tcn_xgboost_mlp_ensemble_and_learning_baseline(client):
    # Enroll a new synthetic patient using the simplified 10-field 2-step payload
    # (no name, no wearable SpO2/HR/RR inputs, optional fev1_fvc/pef, simulated_device_profile)
    res = client.post(
        "/api/patients",
        json={
            "age": 38,
            "gender": "Female",
            "city": "New Delhi",
            "asthma_severity": "Severe_Persistent",
            "simulated_device_profile": "restless_sleeper",
            "baseline_fev1_pct": 58.0,
            "controller_medication": "Budesonide_Formoterol_200_6",
            "reported_adherence": 42,
            "flare_ups_last_year": 4,
            "hospitalized": True,
            "smoking_status": "Former",
            "pack_years": 9,
            "allergens": ["PM2.5 Smog", "Dust Mites", "Cold Air"],
        },
    )
    assert res.status_code == 201
    new_patient = res.json()

    # Auto-generated synthetic ID and label
    assert new_patient["id"].startswith("PT-")
    assert "Synthetic" in new_patient["name"]
    assert new_patient["simulatedDeviceProfile"] == "restless_sleeper"

    # Must execute all 3 model stages (Dilated TCN + XGBoost -> MLP Meta-Learner)
    assert "basePredictions" in new_patient
    bp = new_patient["basePredictions"]
    assert "tcnRisk48h" in bp
    assert "xgbRisk48h" in bp
    assert "mlpRisk48h" in bp
    assert new_patient["risk48h"] == bp["mlpRisk48h"]

    # Automatic What-If preview generated during predict_patient
    assert "whatIfPreview" in new_patient
    assert "simulated_risk_48h" in new_patient["whatIfPreview"]

    # FR-16 Learning Baseline with wide uncertainty bands narrowing over Days 1-7
    assert "learningBaseline" in new_patient
    lb = new_patient["learningBaseline"]
    assert lb["active"] is True
    assert lb["day"] == 1
    assert lb["bandHalfWidthPct"] >= 18.0
    assert len(lb["uncertaintySchedule"]) == 7
    assert lb["uncertaintySchedule"][0]["halfWidthPct"] > lb["uncertaintySchedule"][-1]["halfWidthPct"]

    # Subsequent detail lookup and cohort prediction must NOT crash
    res_detail = client.get(f"/api/patients/{new_patient['id']}")
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == new_patient["id"]


def test_what_if_endpoint_re_runs_dilated_tcn_xgboost_mlp_meta_learner(client):
    res_high_exposure = client.post(
        "/api/what-if",
        json={
            "patient_id": "PT-8821",
            "base_risk_48h": 82.0,
            "base_inflammation": 0.84,
            "current_pm25": 240.0,
            "current_adherence_pct": 55.0,
            "outdoor_hours": 5.0,
            "wear_n95": False,
            "target_adherence_pct": 40.0,
            "hepa_purifier": False,
        },
    )
    assert res_high_exposure.status_code == 200
    high_body = res_high_exposure.json()

    res_protected = client.post(
        "/api/what-if",
        json={
            "patient_id": "PT-8821",
            "base_risk_48h": 82.0,
            "base_inflammation": 0.84,
            "current_pm25": 240.0,
            "current_adherence_pct": 55.0,
            "outdoor_hours": 0.5,
            "wear_n95": True,
            "target_adherence_pct": 100.0,
            "hepa_purifier": True,
        },
    )
    assert res_protected.status_code == 200
    prot_body = res_protected.json()

    assert "modelBreakdown" in prot_body
    mb = prot_body["modelBreakdown"]
    assert mb["scoringEngine"] == "Dilated_TCN_XGBoost_MLP_MetaLearner"
    assert "tcn48h" in mb and "xgboost48h" in mb and "mlpMeta48h" in mb
    assert len(prot_body.get("trajectoryPoints", [])) >= 5
    assert prot_body["simulated_risk_48h"] < high_body["simulated_risk_48h"]


def test_section5_forecast_contract_and_endpoints(client):
    # 1. GET /api/patients/:id/forecast agrees with twin endpoint & satisfies V1-V4 invariants
    res_twin = client.get("/api/patients/PT-8821?hour=168")
    assert res_twin.status_code == 200
    twin = res_twin.json()

    res_fc = client.get("/api/patients/PT-8821/forecast?hour=168")
    assert res_fc.status_code == 200
    fc = res_fc.json()

    assert fc["patientId"] == "PT-8821"
    assert fc["modelVersion"] == "twin-0.3.1"
    assert fc["status"] in ("normal", "watch", "alert")
    assert fc["alertPolicy"]["threshold"] == 0.70

    # V1: 49 hourly points (0..48), cumulative p never decreases, matches twin 24h & 48h risk
    curve = fc["curve"]
    assert len(curve) == 49
    assert curve[0]["h"] == 0 and curve[0]["p"] == 0.0
    assert curve[24]["h"] == 24 and round(curve[24]["p"] * 100, 1) == twin["risk24h"]
    assert curve[48]["h"] == 48 and round(curve[48]["p"] * 100, 1) == twin["risk48h"]
    for i in range(1, len(curve)):
        assert curve[i]["p"] >= curve[i - 1]["p"]
        assert 0.0 <= curve[i]["lo"] <= curve[i]["p"] <= curve[i]["hi"] <= 1.0

    # V2: drivers must sum to (p48 - baseline) in percentage points within 0.5 pts
    drivers = fc["drivers"]
    baseline_pp = drivers["baseline"] * 100.0
    p48_pp = curve[48]["p"] * 100.0
    items = drivers["items"]
    assert len(items) == 6
    total_driver_pp = sum(d["deltaPp"] for d in items) + drivers["other"]["deltaPp"]
    assert abs((baseline_pp + total_driver_pp) - p48_pp) <= 0.5

    # V3: 3 wearable signals, 7 days hourly with uninterpolated gaps (None), and +48h expected on inflammation
    signals = fc["signals"]
    assert len(signals) == 3
    assert signals[0]["id"] == "inflammation"
    assert signals[0]["expected"] is not None and len(signals[0]["expected"]) == 49
    null_count = sum(1 for pt in signals[0]["points"] if pt["v"] is None)
    assert null_count == fc["dataQuality"]["missingHours7d"]
    assert null_count > 0

    # V4: airQuality has observed & forecast points, CPCB bins, and server-derived AQI category
    aq = fc["airQuality"]
    assert any(p["kind"] == "observed" for p in aq["points"])
    assert any(p["kind"] == "forecast" for p in aq["points"])
    bin_categories = {b["category"] for b in aq["bins"]}
    assert aq["aqi"]["category"] in bin_categories

    # 2. SSE Stream endpoint
    res_sse = client.get("/api/patients/PT-8821/forecast/stream?once=true")
    assert res_sse.status_code == 200
    assert "event: forecast.updated" in res_sse.text

    # 3. POST /api/patients/:id/what-if returns the same payload shape with scenarioId & delta48hPp
    res_wi = client.post(
        "/api/patients/PT-8821/what-if",
        json={
            "scenarioId": "max-shield",
            "scenarioLabel": "Maximum protection",
            "outdoor_hours": 0.5,
            "wear_n95": True,
            "target_adherence_pct": 100.0,
            "hepa_purifier": True,
            "hour": 168,
        },
    )
    assert res_wi.status_code == 200
    wi_fc = res_wi.json()
    assert wi_fc["scenarioId"] == "max-shield"
    assert len(wi_fc["curve"]) == 49
    assert wi_fc["delta48hPp"] < 0


def test_plain_text_clinical_note_outlier_simulation_and_continual_adaptation(client):
    # 1. Fast Loop: Plain-text Typhoid fever note -> LLM clinical extraction -> 9 derived features -> re-scored ensemble
    res_sim = client.post(
        "/api/patients/PT-8821/clinical-note/simulate",
        json={
            "note": "Patient diagnosed with Typhoid fever (Salmonella Typhi), persistent 103.2F fever, severe dehydration, and resting tachycardia 118 bpm.",
            "hour": 168,
        },
    )
    assert res_sim.status_code == 200
    sim = res_sim.json()
    assert sim["patientId"] == "PT-8821"
    assert "Typhoid" in sim["extraction"]["primary_condition"]
    assert sim["extraction"]["icd10_code"] == "A01.0"
    assert len(sim["derivedFeatures"]) == 9
    assert sim["adapted"]["risk48h"] > sim["baseline"]["risk48h"]
    assert sim["deltas"]["risk48hDelta"] > 0
    assert sim["adapted"]["inflammation"] > sim["baseline"]["inflammation"]
    assert len(sim["trajectoryPoints"]) == 13

    # 2. Slow Loop: Commit outlier note and execute EWC-regularized continual adaptation of Stage-2 Meta-Learner
    res_adapt = client.post(
        "/api/model/adapt-outliers",
        json={
            "patient_id": "PT-8821",
            "note": "Patient diagnosed with Typhoid fever (Salmonella Typhi), persistent 103.2F fever, severe dehydration, and resting tachycardia 118 bpm.",
            "epochs": 12,
            "ewc_lambda": 85.0,
        },
    )
    assert res_adapt.status_code == 200
    adapt = res_adapt.json()
    assert adapt["validationPassed"] is True
    assert adapt["status"] == "completed_and_hot_swapped"
    assert adapt["brierCalibrationScore"] <= 0.12
    assert adapt["finalLoss"] <= adapt["initialLoss"]
    assert "outlier-adapted" in adapt["modelVersion"]

    # 3. Verify adaptation status endpoint reflects updated model version & outlier replay buffer
    res_status = client.get("/api/model/adaptation-status")
    assert res_status.status_code == 200
    status = res_status.json()
    assert status["modelVersion"] == adapt["modelVersion"]
    assert status["outlierBufferCount"] >= 1
    assert any("Typhoid" in c["primaryCondition"] for c in status["outlierCases"])


# =========================================================================
# REAL-TIME ACOUSTIC SENSOR & COUGH INFERENCE TESTS
# =========================================================================

def test_acoustic_pipeline_unit():
    """Verifies that the LiveAudioFeaturePipeline in mic_features_inference.py processes chunks."""
    from aasthma.inference.mic_features_inference import get_patient_audio_pipeline
    pipeline = get_patient_audio_pipeline("PT-8821")
    assert pipeline is not None
    # Feed 1-second synthetic audio chunk
    synthetic_audio = np.random.randn(16000).astype(np.float32) * 0.05
    res = pipeline.process_audio_chunk(synthetic_audio, sample_rate=16000)
    assert "instant" in res
    assert "telemetry" in res
    assert "hourly_cough_count" in res["telemetry"]
    assert "wheeze_percent_duration" in res["telemetry"]
    assert "sputum_severity" in res["telemetry"]


def test_acoustic_telemetry_and_audio_stream_endpoints(client):
    """Verifies the audio-stream ingestion and acoustic-telemetry persistence endpoints."""
    # 1. Post to audio-stream endpoint
    res_stream = client.post(
        "/api/patients/PT-8821/audio-stream",
        json={
            "client_coughs": 4,
            "client_cough_severity": 2,
        },
    )
    assert res_stream.status_code == 200
    stream_data = res_stream.json()
    assert "patientRisk" in stream_data
    assert stream_data["patientRisk"]["coughSeverity"] >= 2
    assert stream_data["patientRisk"]["asthmaChancePercent"] > 0
    assert "telemetry" in stream_data

    # 2. Post structured telemetry
    res_post = client.post(
        "/api/patients/PT-8821/acoustic-telemetry",
        json={
            "hourly_cough_count": 18,
            "cough_severity": 3,
            "wheeze_percent_duration": 22.5,
            "sputum_severity": 3,
            "stridor_detection_index": 0.19,
            "breathlessness_score": 3,
            "vocal_hoarseness_jitter": 1.6,
            "respiratory_rate_brpm": 24.0,
            "source": "Strados RESP Patch",
        },
    )
    assert res_post.status_code == 200
    post_data = res_post.json()
    assert post_data["record"]["hourly_cough_count"] == 18

    # 3. Retrieve acoustic telemetry history
    res_get = client.get("/api/patients/PT-8821/acoustic-telemetry?limit=5")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["count"] >= 1
    assert "history" in get_data


def test_acoustic_outlier_model_inference(client):
    """Verifies that doctor-triggered acoustic outlier inference recalculates twin risk and ODE inflammation."""
    res = client.post(
        "/api/patients/PT-8821/acoustic-inference",
        json={
            "hourly_cough_count": 22,
            "cough_severity": 3,
            "wheeze_percent_duration": 28.0,
            "sputum_severity": 3,
            "stridor_detection_index": 0.25,
            "breathlessness_score": 4,
            "vocal_hoarseness_jitter": 1.85,
            "respiratory_rate_brpm": 26.0,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["patientId"] == "PT-8821"
    assert "acousticBiomarkers" in data
    assert data["acousticBiomarkers"]["hourlyCoughCount"] == 22
    assert data["adapted"]["risk48h"] > data["baseline"]["risk48h"]
    assert data["deltas"]["risk48hDelta"] > 0
    assert data["adapted"]["inflammation"] > data["baseline"]["inflammation"]
    assert len(data["trajectory"]) > 0
    assert len(data["adapted"]["shapReasons"]) >= 3






