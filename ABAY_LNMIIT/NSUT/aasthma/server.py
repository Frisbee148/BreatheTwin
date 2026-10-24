import os
import logging
from typing import Dict, Any, List, Optional, Union
from dotenv import find_dotenv, load_dotenv

# Load environment variables (.env) from workspace / package roots
load_dotenv(find_dotenv(usecwd=True), override=False)
load_dotenv()
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aasthma.inference.inference_engine import InferenceEngine, DEMO_PERSONAS
from aasthma.llm.llm import (
    CopilotConfigurationError,
    CopilotProviderError,
    CopilotResponseError,
    build_patient_copilot_payload,
    generate_copilot_report,
    generate_patient_chat_response,
)
from aasthma.simulation.mechanistic_simulator import MechanisticSimulator
from aasthma.simulation.clock import global_clock
from aasthma.simulation.clinical_data import SIMULATOR_ASSUMPTIONS, BENCHMARKS
from aasthma.inference.mic_features_inference import get_patient_audio_pipeline
from aasthma.inference.face_features_inference import get_patient_face_pipeline
from aasthma.database import (
    get_db_status,
    get_patient_by_id,
    get_patient_telemetry_series,
    add_patient_daily_log,
    get_patient_daily_logs,
    add_acoustic_telemetry,
    get_patient_acoustic_telemetry,
    add_visual_telemetry,
    get_patient_visual_telemetry,
    ensure_auth_tables_and_seed,
    signup_user_account,
    verify_user_account,
    login_user_account,
    list_user_accounts,
)

from contextlib import asynccontextmanager

# Singleton instances initialized on server startup
engine: Optional[InferenceEngine] = None
simulator = MechanisticSimulator()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print("[BreathTwin API] Initializing neural digital twin model and preprocessors...")
    try:
        ensure_auth_tables_and_seed()
    except Exception as exc:
        logger.warning("Could not seed PostgreSQL auth tables at startup: %s", exc)
    engine = InferenceEngine()
    print("[BreathTwin API] Model loaded successfully. Service ready on port 8000.")
    yield


app = FastAPI(
    title="BreathTwin Clinical Digital Twin Service",
    description="Multimodal neural inference and mechanistic counterfactual simulator API (PRD FR-1 to FR-8)",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Request Models
class ClockSetRequest(BaseModel):
    hour: int = Field(..., ge=12, le=239, description="Simulation hour between 12 and 239")


class ClockStepRequest(BaseModel):
    hours: int = Field(default=1, description="Number of simulation hours to step (positive or negative)")


class WhatIfRequest(BaseModel):
    patient_id: Optional[str] = "PT-8821"
    base_risk_48h: float = Field(default=82.0, ge=0.0, le=100.0)
    base_inflammation: float = Field(default=0.84, ge=0.0, le=1.0)
    current_pm25: float = Field(default=184.0, ge=0.0)
    current_adherence_pct: float = Field(default=68.0, ge=0.0, le=100.0)
    outdoor_hours: float = Field(default=2.5, ge=0.0, le=12.0)
    wear_n95: bool = False
    target_adherence_pct: Optional[float] = None
    hepa_purifier: bool = False
    horizon_hours: int = Field(default=48, ge=12, le=96)


class PatientDailyLogRequest(BaseModel):
    rescue_puffs: int = Field(default=0, ge=0, le=30, description="Rescue inhaler actuations")
    controller_taken: bool = Field(default=True, description="Did patient take prescribed controller medication?")
    cough_score: int = Field(default=0, ge=0, le=3, description="Cough severity (0: None, 1: Mild, 2: Moderate, 3: Severe)")
    wheezing_score: int = Field(default=0, ge=0, le=3, description="Wheezing score (0-3)")
    chest_tightness_score: int = Field(default=0, ge=0, le=3, description="Chest tightness score (0-3)")
    breathlessness_score: int = Field(default=0, ge=0, le=3, description="Breathlessness score (0-3)")
    notes: Optional[str] = Field(default=None, description="Clinical or self-reported notes")


class PatientChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000, description="Patient question about their forecast")
    history: Optional[List[Dict[str, str]]] = Field(default=None, description="Prior conversation messages")


class AuthSignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: str = Field(..., pattern="^(doctor|patient)$")
    password: str = Field(..., min_length=4, max_length=128)
    patient_id: Optional[str] = Field(default="0", description="Assigned patient profile ID for patient accounts")
    license_or_clinic: Optional[str] = Field(default=None, description="Medical license or clinic / care plan")


class AuthVerifyRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    verification_code: str = Field(..., min_length=4, max_length=16)


class AuthLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)
    role: str = Field(..., pattern="^(doctor|patient)$")


class CreatePatientRequest(BaseModel):
    name: Optional[str] = Field(default=None, description="Optional synthetic label; auto-generated if omitted")
    age: int = Field(default=40, ge=5, le=105)
    gender: str = Field(default="Male", description="Biological sex (Male/Female)")
    city: str = Field(default="New Delhi")
    station: Optional[str] = None
    asthma_severity: str = Field(default="Moderate_Persistent")
    simulated_device_profile: str = Field(
        default="typical",
        description="Simulated wearable stream profile: typical, restless_sleeper, or low_activity",
    )
    baseline_fev1_pct: float = Field(default=72.0, ge=20.0, le=120.0)
    baseline_fev1_fvc: Optional[float] = Field(default=None, ge=0.3, le=1.0)
    baseline_pef_lmin: Optional[float] = Field(default=None, ge=100.0, le=800.0)
    baseline_spo2: Optional[float] = Field(default=None, ge=80.0, le=100.0)
    baseline_resting_hr: Optional[int] = Field(default=None, ge=45, le=140)
    baseline_rr: Optional[int] = Field(default=None, ge=8, le=40)
    controller_medication: str = Field(default="Budesonide_Formoterol_200_6")
    controller_adherence: Optional[int] = Field(default=None, ge=0, le=100)
    reported_adherence: Optional[int] = Field(default=75, ge=0, le=100)
    smoking_status: str = Field(default="Never")
    pack_years: int = Field(default=0, ge=0, le=100)
    copd_status: bool = False
    comorbidity_burden: int = Field(default=1, ge=0, le=5)
    flare_ups_last_year: int = Field(default=1, ge=0, le=20)
    hospitalized: bool = False
    allergens: Optional[Union[List[str], str]] = Field(
        default_factory=lambda: ["Dust Mites", "PM2.5 Smog"]
    )


# Routes
@app.get("/")
@app.get("/api/health")
def health_check():
    db_status = get_db_status()
    return {
        "status": "healthy" if db_status.get("status") == "connected" else "degraded",
        "service": "BreathTwin Multimodal Digital Twin Core",
        "version": "1.0.0",
        "database": db_status,
        "simulation_clock": global_clock.get_time_info(),
        "model_loaded": engine is not None,
    }


@app.post("/api/auth/signup")
def api_auth_signup(req: AuthSignupRequest):
    """Registers a Doctor or Patient account in PostgreSQL and generates a 6-digit verification code."""
    try:
        account = signup_user_account(
            email=req.email,
            full_name=req.full_name,
            role=req.role,
            password=req.password,
            patient_id=req.patient_id,
            license_or_clinic=req.license_or_clinic,
        )
        return {
            "status": "verification_required",
            "message": f"Verification code generated for {account['email']}. Enter the 6-digit code to activate your account.",
            "account": account,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PostgreSQL signup error: {exc}") from exc


@app.post("/api/auth/verify")
def api_auth_verify(req: AuthVerifyRequest):
    """Verifies a Doctor or Patient account using the 6-digit verification code stored in PostgreSQL."""
    try:
        account = verify_user_account(email=req.email, verification_code=req.verification_code)
        return {
            "status": "verified",
            "message": "Account verified in PostgreSQL.",
            "account": account,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PostgreSQL verification error: {exc}") from exc


@app.post("/api/auth/login")
def api_auth_login(req: AuthLoginRequest):
    """Authenticates a verified Doctor or Patient account from PostgreSQL."""
    try:
        account = login_user_account(email=req.email, password=req.password, role=req.role)
        return {
            "status": "authenticated",
            "message": f"Logged in as {account['role']}",
            "account": account,
        }
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PostgreSQL login error: {exc}") from exc


@app.get("/api/auth/users")
def api_auth_users():
    """Returns registered accounts stored in PostgreSQL."""
    try:
        users = list_user_accounts()
        return {"count": len(users), "users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list PostgreSQL accounts: {exc}") from exc



@app.get("/api/clock")
def get_clock():
    """Returns the current simulation clock temporal position (PRD FR-4)."""
    return global_clock.get_time_info()


@app.post("/api/clock/set")
def set_clock(req: ClockSetRequest):
    """Sets the simulation replay clock to a specific hour."""
    new_hour = global_clock.set_hour(req.hour)
    return {
        "message": f"Simulation clock updated to hour {new_hour}",
        "clock": global_clock.get_time_info(),
    }


@app.post("/api/clock/step")
def step_clock(req: ClockStepRequest):
    """Advances or rewinds the simulation clock."""
    new_hour = global_clock.step(req.hours)
    return {
        "message": f"Simulation clock stepped by {req.hours}h to hour {new_hour}",
        "clock": global_clock.get_time_info(),
    }


@app.post("/api/clock/reset")
def reset_clock():
    """Resets the simulation clock to baseline Day 7 (Hour 168)."""
    new_hour = global_clock.reset()
    return {
        "message": f"Simulation clock reset to baseline Day 7 (hour {new_hour})",
        "clock": global_clock.get_time_info(),
    }


@app.get("/api/patients")
def list_patients(
    limit: int = Query(default=12, ge=1, le=50),
    hour: Optional[int] = Query(default=None, ge=12, le=239)
):
    """
    Returns the ranked cohort roster for the doctor dashboard triage view (PRD FR-1, FR-5, FR-8).
    Evaluated dynamically up to the specified hour (or current simulation clock hour).
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    cohort = engine.predict_cohort(end_hour=eval_hour, limit=limit)
    return cohort


@app.post("/api/patients", status_code=201)
def create_patient(req: CreatePatientRequest):
    """
    Onboards a new patient into the digital twin core, runs multimodal neural inference,
    and returns their initialized twin state with 24h & 48h risks and SHAP attributions.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    try:
        new_twin = engine.register_patient(req.model_dump())
        return new_twin
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create patient twin: {str(e)}")


@app.get("/api/patients/{patient_id}")
def get_patient_detail(
    patient_id: str,
    hour: Optional[int] = Query(default=None, ge=12, le=239)
):
    """
    Returns full digital twin state for a single patient with 24h & 48h neural risk,
    conformal prediction intervals, and ranked SHAP feature attributions (PRD FR-5, FR-6).
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    try:
        patient_data = engine.get_formatted_patient(patient_id, end_hour=eval_hour)
        return patient_data
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


class PredictPatientRequest(BaseModel):
    hour: Optional[int] = Field(default=None, ge=12, le=239)


@app.get("/api/predict/{patient_id}")
@app.post("/api/predict/{patient_id}")
def predict_patient_route(
    patient_id: str,
    req: Optional[PredictPatientRequest] = None,
    hour: Optional[int] = Query(default=None, ge=12, le=239),
):
    """
    Returns 24h & 48h risk prediction, severity tier, conformal intervals,
    and ranked SHAP feature attributions for the specified patient.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    eval_hour = (req.hour if req and req.hour is not None else None) or hour or global_clock.current_hour
    try:
        raw_pred = engine.predict_patient(patient_id, end_hour=eval_hour)
        return {
            "patient_id": patient_id,
            "hour": eval_hour,
            "risk_24h": round(raw_pred.get("risk24h", 0.0), 1),
            "risk_48h": round(raw_pred.get("risk48h", 0.0), 1),
            "severity_grade": raw_pred.get("severityClass", 0),
            "severity_label": raw_pred.get("riskLevel", "Moderate"),
            "conformal_interval_24h": raw_pred.get("risk24hInterval", [0, 100]),
            "conformal_interval_48h": raw_pred.get("risk48hInterval", [0, 100]),
            "estimated_inflammation": round(raw_pred.get("estimatedInflammationState", 0.5), 2),
            "top_shap_features": [
                {
                    "feature": s.get("feature"),
                    "impactPercent": s.get("impactPercent"),
                    "direction": s.get("direction", "up"),
                }
                for s in raw_pred.get("shapReasons", [])
            ],
            "raw": raw_pred,
        }
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


class PatientWhatIfForecastRequest(BaseModel):
    scenarioId: str = Field(default="custom")
    scenarioLabel: Optional[str] = Field(default=None)
    outdoor_hours: float = Field(default=2.5, ge=0.0, le=12.0)
    wear_n95: bool = False
    target_adherence_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    hepa_purifier: bool = False
    asOf: Optional[str] = Field(default=None)
    hour: Optional[int] = Field(default=None, ge=12, le=239)


@app.get("/api/patients/{patient_id}/forecast")
def get_patient_forecast_payload(
    patient_id: str,
    asOf: Optional[str] = Query(default=None, description="Simulation time ISO 8601"),
    hour: Optional[int] = Query(default=None, ge=12, le=239),
):
    """
    Returns the unified Section 5 forecast payload stamped with simulation clock time.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    try:
        return engine.get_patient_forecast(patient_id, end_hour=eval_hour, as_of_iso=asOf)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast error: {str(e)}")


@app.get("/api/patients/{patient_id}/forecast/stream")
async def stream_patient_forecast(
    patient_id: str,
    once: bool = Query(default=False, description="Emit one SSE event and close (useful for tests)"),
):
    """
    Server-sent events: emits forecast.updated on initial connection and whenever the simulation clock ticks.
    """
    import asyncio
    import json as _json
    from fastapi.responses import StreamingResponse

    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    resolved_pid = engine.resolve_patient_id(patient_id)
    if resolved_pid not in engine.patient_ids:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")

    async def event_generator():
        last_hour = None
        while True:
            curr_hour = global_clock.current_hour
            if last_hour != curr_hour:
                last_hour = curr_hour
                try:
                    payload = engine.get_patient_forecast(patient_id, end_hour=curr_hour)
                except KeyError:
                    break
                yield f"event: forecast.updated\ndata: {_json.dumps(payload)}\n\n"
                if once:
                    break
            await asyncio.sleep(2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/patients/{patient_id}/what-if")
def create_patient_what_if_forecast(
    patient_id: str,
    req: PatientWhatIfForecastRequest,
):
    """
    Returns the same ForecastPayload shape for a scenario, with scenarioId and delta48hPp, used by V5.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = req.hour if req.hour is not None else global_clock.current_hour
    try:
        return engine.get_patient_what_if_forecast(
            pid=patient_id,
            scenario_id=req.scenarioId,
            scenario_label=req.scenarioLabel,
            outdoor_hours=req.outdoor_hours,
            wear_n95=req.wear_n95,
            target_adherence_pct=req.target_adherence_pct,
            hepa_purifier=req.hepa_purifier,
            end_hour=eval_hour,
            as_of_iso=req.asOf,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scenario forecast error: {str(e)}")


@app.post("/api/patients/{patient_id}/copilot-report")
def create_patient_copilot_report(
    patient_id: str,
    hour: Optional[int] = Query(default=None, ge=12, le=239),
):
    """Generate a clinician-review draft from this patient's model output and telemetry."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    try:
        payload = build_patient_copilot_payload(engine, patient_id, eval_hour)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to build patient copilot payload for %s", patient_id)
        raise HTTPException(status_code=500, detail="Failed to prepare patient report data.") from exc

    try:
        return generate_copilot_report(payload)
    except CopilotConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except (CopilotProviderError, CopilotResponseError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/patients/{patient_id}/chat")
def create_patient_forecast_chat(
    patient_id: str,
    req: PatientChatRequest,
    hour: Optional[int] = Query(default=None, ge=12, le=239),
):
    """
    Guardrailed LLM RAG Forecast Chat for the Patient Portal.
    Uses build_patient_copilot_payload + clinical RAG knowledge base (context.md / prompt.md)
    to answer patient questions about their own forecast in plain language without raw probabilities
    or medication prescribing.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    try:
        payload = build_patient_copilot_payload(engine, patient_id, eval_hour)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to build patient RAG payload for %s", patient_id)
        raise HTTPException(status_code=500, detail="Failed to prepare patient forecast context.") from exc

    resolved_pid = engine.resolve_patient_id(patient_id)
    try:
        recent_logs = get_patient_daily_logs(resolved_pid, limit=5)
    except Exception:
        recent_logs = []

    return generate_patient_chat_response(
        payload=payload,
        question=req.question,
        history=req.history,
        recent_logs=recent_logs,
    )



@app.get("/api/patients/{patient_id}/telemetry")
def get_patient_telemetry(
    patient_id: str,
    hour: Optional[int] = Query(default=None, ge=12, le=239)
):
    """
    Returns daily aggregated telemetry points (Day 1 through current day)
    replayed through the simulation clock feed (PRD FR-4).
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = hour if hour is not None else global_clock.current_hour
    resolved_pid = engine.resolve_patient_id(patient_id)
    p_ts = engine.ts_df[engine.ts_df["patient_id"] == resolved_pid]

    if p_ts.empty:
        raise HTTPException(status_code=404, detail=f"No telemetry found for patient {patient_id}")

    # Temporarily set clock hour if user passed an explicit query hour
    orig_hour = global_clock.current_hour
    try:
        if hour is not None:
            global_clock.set_hour(hour)
        daily_points = global_clock.aggregate_daily_telemetry(p_ts)
        return {
            "patient_id": patient_id,
            "dataset_id": resolved_pid,
            "current_hour": global_clock.current_hour,
            "points": daily_points,
        }
    finally:
        if hour is not None:
            global_clock.set_hour(orig_hour)


@app.post("/api/what-if")
def simulate_counterfactual(req: WhatIfRequest):
    """
    Runs mechanistic counterfactual What-If simulation by numerically integrating
    the latent airway inflammation differential equation and re-scoring neural risk
    via Dilated TCN + XGBoost -> MLP Meta-Learner (PRD FR-7).
    """
    result = simulator.simulate_what_if(
        base_risk_48h=req.base_risk_48h,
        base_inflammation=req.base_inflammation,
        current_pm25=req.current_pm25,
        current_adherence_pct=req.current_adherence_pct,
        outdoor_hours=req.outdoor_hours,
        wear_n95=req.wear_n95,
        target_adherence_pct=req.target_adherence_pct,
        hepa_purifier=req.hepa_purifier,
        horizon_hours=req.horizon_hours,
        engine=engine,
        patient_id=req.patient_id,
        eval_hour=global_clock.current_hour,
    )
    return result


@app.get("/api/assumptions")
def get_clinical_assumptions():
    """Returns biological parameter citations and physiological roles (PRD FR-12)."""
    return SIMULATOR_ASSUMPTIONS


@app.get("/api/benchmarks")
def get_benchmarks():
    """Returns model benchmark comparisons and ablation test results (PRD Section 11)."""
    return BENCHMARKS


@app.get("/api/db/status")
def database_status():
    """Returns PostgreSQL connection state and table record statistics."""
    return get_db_status()


@app.post("/api/patients/{patient_id}/log")
def record_patient_check_in(patient_id: str, req: PatientDailyLogRequest):
    """
    Patient-Reported Outcomes (PRO) Entry Endpoint
    Allows the patient to enter daily symptoms, rescue inhaler puffs, and controller adherence into PostgreSQL.
    """
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    saved_log = add_patient_daily_log(
        patient_id=resolved_pid,
        rescue_puffs=req.rescue_puffs,
        controller_taken=req.controller_taken,
        cough_score=req.cough_score,
        wheezing_score=req.wheezing_score,
        chest_tightness_score=req.chest_tightness_score,
        breathlessness_score=req.breathlessness_score,
        notes=req.notes,
    )
    return {
        "message": "Patient check-in recorded successfully in PostgreSQL",
        "log": saved_log,
    }


@app.get("/api/patients/{patient_id}/logs")
def list_patient_logs(patient_id: str, limit: int = Query(default=20, ge=1, le=100)):
    """Fetches patient self-reported check-in history from PostgreSQL."""
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    logs = get_patient_daily_logs(resolved_pid, limit=limit)
    return {
        "patient_id": patient_id,
        "dataset_id": resolved_pid,
        "count": len(logs),
        "logs": logs,
    }


class ClinicalNoteSimulateRequest(BaseModel):
    note: str = Field(..., min_length=3, max_length=2000, description="Free-text clinical observation or outlier diagnosis")
    hour: Optional[int] = Field(default=None, ge=12, le=239)


class ClinicalNoteCommitRequest(BaseModel):
    note: str = Field(..., min_length=3, max_length=2000)
    verified_by_doctor: bool = True
    hour: Optional[int] = Field(default=None, ge=12, le=239)


class ModelAdaptRequest(BaseModel):
    patient_id: Optional[str] = Field(default="PT-8821")
    note: Optional[str] = Field(default=None)
    epochs: int = Field(default=14, ge=5, le=40)
    learning_rate: float = Field(default=0.002, ge=0.0001, le=0.02)
    ewc_lambda: float = Field(default=85.0, ge=1.0, le=500.0)


@app.post("/api/patients/{patient_id}/clinical-note/simulate")
def simulate_patient_clinical_note(patient_id: str, req: ClinicalNoteSimulateRequest):
    """
    Converts a plain-text clinical note or outlier diagnosis (e.g., Typhoid fever, Dengue,
    gastroenteritis) into multiple derived static, dynamic, and mechanistic ODE features,
    and re-runs the full stacked ensemble digital twin.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    eval_hour = req.hour if req.hour is not None else global_clock.current_hour
    try:
        return engine.simulate_clinical_outlier(pid=patient_id, note_text=req.note, end_hour=eval_hour)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Outlier simulation failed: {exc}") from exc


@app.post("/api/patients/{patient_id}/clinical-note/commit")
def commit_patient_clinical_note(patient_id: str, req: ClinicalNoteCommitRequest):
    """
    Stores a doctor-verified outlier clinical note and its derived features into the
    Experience Replay Buffer for continual model adaptation.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    eval_hour = req.hour if req.hour is not None else global_clock.current_hour
    try:
        return engine.commit_clinical_outlier(
            pid=patient_id,
            note_text=req.note,
            verified_by_doctor=req.verified_by_doctor,
            end_hour=eval_hour,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to commit outlier note: {exc}") from exc


@app.post("/api/model/adapt-outliers")
def trigger_model_outlier_adaptation(req: ModelAdaptRequest):
    """
    Executes EWC-regularized continual adaptation of the Stage-2 Meta-Learner on the
    Outlier Experience Replay Buffer + synthetic mechanistic trajectory rollouts.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    try:
        return engine.adapt_outlier_model(
            patient_id=req.patient_id,
            note_text=req.note,
            epochs=req.epochs,
            learning_rate=req.learning_rate,
            ewc_lambda=req.ewc_lambda,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model adaptation failed: {exc}") from exc


@app.get("/api/model/adaptation-status")
def get_model_adaptation_status():
    """Returns active model version, outlier replay buffer entries, and adaptation metrics."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    return engine.get_adaptation_status()


# =========================================================================
# REAL-TIME ACOUSTIC BIOSENSOR & COUGH DETECTION ENDPOINTS
# =========================================================================

class AudioStreamChunkRequest(BaseModel):
    audio_base64: Optional[str] = Field(default=None, description="Base64-encoded audio chunk (WAV/PCM/WebM)")
    sample_rate: int = Field(default=16000, ge=8000, le=48000)
    client_coughs: Optional[int] = Field(default=None)
    client_cough_severity: Optional[int] = Field(default=None, ge=0, le=3)


class AcousticTelemetryPostRequest(BaseModel):
    hourly_cough_count: int = Field(default=0, ge=0, le=100)
    cough_severity: int = Field(default=0, ge=0, le=3)
    wheeze_percent_duration: float = Field(default=0.0, ge=0.0, le=100.0)
    sputum_severity: int = Field(default=0, ge=0, le=3)
    stridor_detection_index: float = Field(default=0.0, ge=0.0, le=1.0)
    breathlessness_score: int = Field(default=0, ge=0, le=5)
    snoring_nocturnal_score: float = Field(default=0.0, ge=0.0, le=10.0)
    vocal_hoarseness_jitter: float = Field(default=0.8, ge=0.1, le=15.0)
    vocal_shimmer_score: float = Field(default=2.5, ge=0.5, le=25.0)
    ambient_noise_decibels: float = Field(default=45.0, ge=20.0, le=110.0)
    speech_rate_wpm: float = Field(default=130.0, ge=30.0, le=220.0)
    respiratory_rate_brpm: float = Field(default=16.0, ge=8.0, le=45.0)
    source: str = Field(default="Web Microphone")


class AcousticInferenceRequest(BaseModel):
    hourly_cough_count: Optional[int] = Field(default=None, ge=0, le=100)
    cough_severity: Optional[int] = Field(default=None, ge=0, le=3)
    wheeze_percent_duration: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    sputum_severity: Optional[int] = Field(default=None, ge=0, le=3)
    stridor_detection_index: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    breathlessness_score: Optional[int] = Field(default=None, ge=0, le=5)
    vocal_hoarseness_jitter: Optional[float] = Field(default=None, ge=0.1, le=15.0)
    vocal_shimmer_score: Optional[float] = Field(default=None, ge=0.5, le=25.0)
    ambient_noise_decibels: Optional[float] = Field(default=None, ge=20.0, le=110.0)
    respiratory_rate_brpm: Optional[float] = Field(default=None, ge=8.0, le=45.0)
    hour: Optional[int] = Field(default=None, ge=12, le=239)


@app.post("/api/patients/{patient_id}/audio-stream")
def process_patient_audio_stream(patient_id: str, req: AudioStreamChunkRequest):
    """
    Ingests live microphone audio chunks from the patient portal, runs the
    LiveAudioFeaturePipeline (YamNet + Librosa DSP), evaluates cough severity,
    and returns immediate asthma attack risk chances.
    """
    import base64

    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    pipeline = get_patient_audio_pipeline(resolved_pid)

    # Process audio through mic_features_inference.py
    if req.audio_base64:
        try:
            raw_bytes = base64.b64decode(req.audio_base64)
            result = pipeline.process_audio_bytes(raw_bytes)
        except Exception as exc:
            logger.warning("Failed to decode audio bytes: %s", exc)
            result = {"instant": {"prob_cough": 0.0, "cough_detected": False}, "telemetry": pipeline.get_latest_hourly_telemetry()}
    else:
        # Client sent metadata or simulated ping
        result = {"instant": {"prob_cough": 0.0, "cough_detected": False}, "telemetry": pipeline.get_latest_hourly_telemetry()}

    telemetry = result.get("telemetry", {})
    instant = result.get("instant", {})

    # Calculate cough severity score (0 to 3)
    cough_sev = int(telemetry.get("sputum_severity", 0))
    if req.client_cough_severity is not None:
        cough_sev = max(cough_sev, req.client_cough_severity)
    elif instant.get("cough_detected"):
        cough_sev = max(cough_sev, 2 if instant.get("prob_cough", 0) > 0.75 else 1)

    # Re-calculate digital twin risk with updated acoustic triggers
    twin_risk24 = 18.0
    twin_risk48 = 22.0
    risk_level = "NORMAL"
    if engine:
        try:
            pred = engine.predict_patient(resolved_pid)
            twin_risk24 = float(pred.get("risk24h", 18.0))
            twin_risk48 = float(pred.get("risk48h", 22.0))
            risk_level = pred.get("riskLevel", "NORMAL")
        except Exception:
            pass

    # Dynamic acoustic multiplier on asthma chance
    acoustic_multiplier = 1.0 + (cough_sev * 0.18) + (float(telemetry.get("wheeze_percent_duration", 0.0)) * 0.015)
    effective_asthma_chance = round(min(98.0, twin_risk48 * acoustic_multiplier), 1)

    # Persist snapshot
    saved_record = add_acoustic_telemetry(
        patient_id=resolved_pid,
        hourly_cough_count=telemetry.get("hourly_cough_count", 0),
        cough_severity=cough_sev,
        wheeze_percent_duration=telemetry.get("wheeze_percent_duration", 0.0),
        sputum_severity=telemetry.get("sputum_severity", 0),
        stridor_detection_index=telemetry.get("stridor_detection_index", 0.0),
        breathlessness_score=telemetry.get("breathlessness_score", 0),
        snoring_nocturnal_score=telemetry.get("snoring_nocturnal_score", 0.0),
        vocal_hoarseness_jitter=telemetry.get("vocal_hoarseness_jitter", 0.8),
        vocal_shimmer_score=telemetry.get("vocal_shimmer_score", 2.5),
        ambient_noise_decibels=telemetry.get("ambient_noise_decibels", 45.0),
        speech_rate_wpm=telemetry.get("speech_rate_wpm", 130.0),
        respiratory_rate_brpm=telemetry.get("respiratory_rate_brpm", 16.0),
        source="Patient Portal Live Mic",
    )

    return {
        "instant": instant,
        "telemetry": telemetry,
        "patientRisk": {
            "risk24h": round(min(96.0, twin_risk24 * acoustic_multiplier), 1),
            "risk48h": effective_asthma_chance,
            "riskLevel": (
                "HIGH RISK" if effective_asthma_chance >= 70.0 else
                "ELEVATED" if effective_asthma_chance >= 45.0 else
                "CAUTION" if effective_asthma_chance >= 25.0 else "NORMAL"
            ),
            "coughSeverity": cough_sev,
            "coughSeverityLabel": (
                "Severe / Paroxysmal" if cough_sev == 3 else
                "Moderate Coughing" if cough_sev == 2 else
                "Mild / Occasional" if cough_sev == 1 else "None / Quiet"
            ),
            "asthmaChancePercent": effective_asthma_chance,
            "wheezeDetected": instant.get("wheeze_detected", False),
        },
        "log": saved_record,
    }


@app.post("/api/patients/{patient_id}/acoustic-telemetry")
def record_patient_acoustic_telemetry(patient_id: str, req: AcousticTelemetryPostRequest):
    """Stores a structured acoustic biosensor session for a patient."""
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    saved = add_acoustic_telemetry(
        patient_id=resolved_pid,
        hourly_cough_count=req.hourly_cough_count,
        cough_severity=req.cough_severity,
        wheeze_percent_duration=req.wheeze_percent_duration,
        sputum_severity=req.sputum_severity,
        stridor_detection_index=req.stridor_detection_index,
        breathlessness_score=req.breathlessness_score,
        snoring_nocturnal_score=req.snoring_nocturnal_score,
        vocal_hoarseness_jitter=req.vocal_hoarseness_jitter,
        vocal_shimmer_score=req.vocal_shimmer_score,
        ambient_noise_decibels=req.ambient_noise_decibels,
        speech_rate_wpm=req.speech_rate_wpm,
        respiratory_rate_brpm=req.respiratory_rate_brpm,
        source=req.source,
    )
    return {
        "message": "Acoustic telemetry recorded successfully",
        "record": saved,
    }


@app.get("/api/patients/{patient_id}/acoustic-telemetry")
def list_patient_acoustic_telemetry(patient_id: str, limit: int = Query(default=24, ge=1, le=100)):
    """Fetches recent acoustic biosensor and cough records for doctor evaluation."""
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    records = get_patient_acoustic_telemetry(resolved_pid, limit=limit)
    latest = records[0] if records else {}
    return {
        "patient_id": patient_id,
        "dataset_id": resolved_pid,
        "count": len(records),
        "latest": latest,
        "history": records,
    }


@app.post("/api/patients/{patient_id}/acoustic-inference")
def simulate_patient_acoustic_inference(patient_id: str, req: AcousticInferenceRequest):
    """
    Doctor-Action Endpoint: Injects patient acoustic biosensor data directly into
    the digital twin's 12-hour sliding window and latent inflammation ODE, re-scoring
    flare-up risk across Stage-1 TCN + XGBoost and Stage-2 Meta-Learner.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = req.hour if req.hour is not None else global_clock.current_hour
    payload = {
        k: v for k, v in req.model_dump().items() if v is not None and k != "hour"
    }

    # If payload is mostly empty, pull latest recorded acoustic metrics from database
    if not payload.get("hourly_cough_count") and not payload.get("cough_severity"):
        resolved_pid = engine.resolve_patient_id(patient_id)
        existing = get_patient_acoustic_telemetry(resolved_pid, limit=1)
        if existing:
            payload = existing[0]

    try:
        return engine.simulate_acoustic_sensor_outlier(
            pid=patient_id,
            acoustic_payload=payload,
            end_hour=eval_hour,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Acoustic outlier inference failed for %s", patient_id)
        raise HTTPException(status_code=500, detail=f"Acoustic inference error: {exc}") from exc


# =========================================================================
# REAL-TIME WEBCAM FACIAL RESPIRATORY DISTRESS & MULTIMODAL ENDPOINTS
# =========================================================================

class VideoStreamChunkRequest(BaseModel):
    image_base64: Optional[str] = Field(default=None, description="Base64-encoded JPEG/PNG frame from webcam")
    client_mar: Optional[float] = Field(default=None, ge=0.0, le=1.5)
    client_flaring: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    client_brow_strain: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    client_bobbing: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    client_video_rr: Optional[float] = Field(default=None, ge=5.0, le=50.0)
    client_rppg_hr: Optional[float] = Field(default=None, ge=40.0, le=180.0)


class VisualTelemetryPostRequest(BaseModel):
    mouth_breathing_ratio: float = Field(default=0.12, ge=0.0, le=1.0)
    nasal_flaring_index: float = Field(default=0.20, ge=0.0, le=1.0)
    brow_strain_score: float = Field(default=0.05, ge=0.0, le=1.0)
    head_bobbing_amplitude: float = Field(default=0.05, ge=0.0, le=1.0)
    video_respiratory_rate: float = Field(default=16.0, ge=8.0, le=45.0)
    forehead_rppg_heart_rate: float = Field(default=72.0, ge=40.0, le=160.0)
    blink_rate_bpm: float = Field(default=15.0, ge=0.0, le=60.0)
    yawn_sigh_count: int = Field(default=0, ge=0, le=100)
    jaw_slack_index: float = Field(default=0.10, ge=0.0, le=1.0)
    gaze_instability_score: float = Field(default=0.03, ge=0.0, le=1.0)
    distress_grade: int = Field(default=0, ge=0, le=3)
    source: str = Field(default="Web Camera")


class MultimodalInferenceRequest(BaseModel):
    acoustic: Optional[Dict[str, Any]] = Field(default=None)
    visual: Optional[Dict[str, Any]] = Field(default=None)
    hour: Optional[int] = Field(default=None, ge=12, le=239)


@app.post("/api/patients/{patient_id}/video-stream")
def process_patient_video_stream(patient_id: str, req: VideoStreamChunkRequest):
    """
    Ingests live webcam frame from patient portal, runs the
    LiveFaceFeaturePipeline (MediaPipe FaceLandmarker + Optical DSP),
    evaluates facial respiratory distress, and returns immediate risk indicators.
    """
    import base64
    import numpy as np

    pipeline = get_patient_face_pipeline(patient_id)
    client_metrics = {}
    if req.client_mar is not None:
        client_metrics["client_mar"] = req.client_mar
    if req.client_flaring is not None:
        client_metrics["client_flaring"] = req.client_flaring
    if req.client_brow_strain is not None:
        client_metrics["client_brow_strain"] = req.client_brow_strain
    if req.client_bobbing is not None:
        client_metrics["client_bobbing"] = req.client_bobbing
    if req.client_video_rr is not None:
        client_metrics["video_rr"] = req.client_video_rr
    if req.client_rppg_hr is not None:
        client_metrics["heart_rate"] = req.client_rppg_hr

    if req.image_base64:
        try:
            clean_b64 = req.image_base64
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
            raw_bytes = base64.b64decode(clean_b64)
            result = pipeline.process_frame_bytes(raw_bytes, client_metrics=client_metrics)
        except Exception as e:
            logger.warning("Failed to decode video frame: %s", e)
            result = {
                "instant": {"mouth_breathing_detected": False, "distress_grade": 0, "video_respiratory_rate": 16.0, "forehead_rppg_heart_rate": 72.0},
                "telemetry": pipeline.get_latest_hourly_telemetry(),
            }
    else:
        mar_active = bool(req.client_mar and req.client_mar > 0.35)
        distress = 1 if mar_active else 0
        result = {
            "instant": {
                "mouth_breathing_detected": mar_active,
                "nasal_flaring_detected": bool(req.client_flaring and req.client_flaring > 0.28),
                "distress_grade": distress,
                "video_respiratory_rate": req.client_video_rr or 16.0,
                "forehead_rppg_heart_rate": req.client_rppg_hr or 72.0,
            },
            "telemetry": pipeline.get_latest_hourly_telemetry(),
        }

    instant = result.get("instant", {})
    telemetry = result.get("telemetry", {})
    distress_grade = int(instant.get("distress_grade", 0))

    base_prob = 15.0
    if engine:
        try:
            base = engine.predict_patient(patient_id)
            base_prob = float(base.get("risk48h", 15.0))
        except Exception:
            pass

    visual_multiplier = 1.0 + (distress_grade * 0.15) + (float(telemetry.get("mouth_breathing_ratio", 0.12)) * 0.25)
    adjusted_prob = float(np.clip(base_prob * visual_multiplier, 0.0, 98.0))

    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    saved_log = add_visual_telemetry(
        patient_id=resolved_pid,
        mouth_breathing_ratio=telemetry.get("mouth_breathing_ratio", 0.12),
        nasal_flaring_index=telemetry.get("nasal_flaring_index", 0.20),
        brow_strain_score=telemetry.get("brow_strain_score", 0.05),
        head_bobbing_amplitude=telemetry.get("head_bobbing_amplitude", 0.05),
        video_respiratory_rate=telemetry.get("video_respiratory_rate", 16.0),
        forehead_rppg_heart_rate=telemetry.get("forehead_rppg_heart_rate", 72.0),
        blink_rate_bpm=telemetry.get("blink_rate_bpm", 15.0),
        yawn_sigh_count=telemetry.get("yawn_sigh_count", 0),
        jaw_slack_index=telemetry.get("jaw_slack_index", 0.10),
        gaze_instability_score=telemetry.get("gaze_instability_score", 0.03),
        distress_grade=distress_grade,
        source="Patient Portal Live Camera",
    )

    return {
        "instant": instant,
        "telemetry": telemetry,
        "patientRisk": {
            "distressGrade": distress_grade,
            "distressGradeLabel": (
                "Severe Labored Breathing" if distress_grade == 3 else
                "Moderate Mouth/Flaring Strain" if distress_grade == 2 else
                "Mild Accessory Tension" if distress_grade == 1 else "Normal Facial Rhythm"
            ),
            "asthmaChancePercent": round(adjusted_prob, 1),
            "mouthBreathing": instant.get("mouth_breathing_detected", False),
            "nasalFlaring": instant.get("nasal_flaring_detected", False),
            "videoRespiratoryRate": instant.get("video_respiratory_rate", 16.0),
            "opticalHeartRate": instant.get("forehead_rppg_heart_rate", 72.0),
        },
        "log": saved_log,
    }


@app.post("/api/patients/{patient_id}/visual-telemetry")
def record_patient_visual_telemetry(patient_id: str, req: VisualTelemetryPostRequest):
    """Allows recording manual or camera-derived visual respiratory distress telemetry."""
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    saved = add_visual_telemetry(
        patient_id=resolved_pid,
        mouth_breathing_ratio=req.mouth_breathing_ratio,
        nasal_flaring_index=req.nasal_flaring_index,
        brow_strain_score=req.brow_strain_score,
        head_bobbing_amplitude=req.head_bobbing_amplitude,
        video_respiratory_rate=req.video_respiratory_rate,
        forehead_rppg_heart_rate=req.forehead_rppg_heart_rate,
        blink_rate_bpm=req.blink_rate_bpm,
        yawn_sigh_count=req.yawn_sigh_count,
        jaw_slack_index=req.jaw_slack_index,
        gaze_instability_score=req.gaze_instability_score,
        distress_grade=req.distress_grade,
        source=req.source,
    )
    return {
        "message": "Visual telemetry recorded successfully",
        "record": saved,
    }


@app.get("/api/patients/{patient_id}/visual-telemetry")
def list_patient_visual_telemetry(patient_id: str, limit: int = Query(default=24, ge=1, le=100)):
    """Fetches recent facial respiratory biosensor records for doctor evaluation."""
    resolved_pid = engine.resolve_patient_id(patient_id) if engine else patient_id
    records = get_patient_visual_telemetry(resolved_pid, limit=limit)
    latest = records[0] if records else {}
    return {
        "patient_id": patient_id,
        "dataset_id": resolved_pid,
        "count": len(records),
        "latest": latest,
        "history": records,
    }


@app.post("/api/patients/{patient_id}/multimodal-inference")
def simulate_patient_multimodal_inference(patient_id: str, req: MultimodalInferenceRequest):
    """
    Doctor-Action Endpoint: Injects combined acoustic biosensors AND facial camera distress
    markers into the digital twin's 12-hour window and latent inflammation ODE, re-scoring
    flare-up risk across Stage-1 TCN + XGBoost and Stage-2 Meta-Learner.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")

    eval_hour = req.hour if req.hour is not None else global_clock.current_hour
    resolved_pid = engine.resolve_patient_id(patient_id)

    acoustic = req.acoustic or {}
    if not acoustic:
        ac_history = get_patient_acoustic_telemetry(resolved_pid, limit=1)
        if ac_history:
            acoustic = ac_history[0]

    visual = req.visual or {}
    if not visual:
        vis_history = get_patient_visual_telemetry(resolved_pid, limit=1)
        if vis_history:
            visual = vis_history[0]

    try:
        return engine.simulate_multimodal_sensor_outlier(
            pid=patient_id,
            acoustic_payload=acoustic,
            visual_payload=visual,
            end_hour=eval_hour,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Multimodal outlier inference failed for %s", patient_id)
        raise HTTPException(status_code=500, detail=f"Multimodal inference error: {exc}") from exc


class FaceFeatureExtractRequest(BaseModel):
    video_frame_base64: Optional[str] = None
    image_base64: Optional[str] = None


class MicFeatureExtractRequest(BaseModel):
    audio_base64: Optional[str] = None
    pcm_base64: Optional[str] = None
    sample_rate: Optional[int] = 16000


class PredictWithExtendedFeaturesRequest(BaseModel):
    face_features: Optional[Dict[str, Any]] = None
    mic_features: Optional[Dict[str, Any]] = None
    wearable_telemetry: Optional[Dict[str, Any]] = None
    end_hour: Optional[int] = None


@app.post("/api/patients/{patient_id}/face-features")
@app.post("/api/patients/{patient_id}/face-features/extract")
def extract_patient_face_features(patient_id: str, req: Optional[FaceFeatureExtractRequest] = None):
    """Extract face biomarkers and normalized landmarks from one browser frame."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    frame_data = (req.video_frame_base64 or req.image_base64) if req else None
    try:
        return engine.extract_face_features_realtime(video_frames=frame_data, patient_id=patient_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Face feature extraction failed: {exc}") from exc


@app.post("/api/patients/{patient_id}/mic-features")
@app.post("/api/patients/{patient_id}/mic-features/extract")
def extract_patient_mic_features(patient_id: str, req: Optional[MicFeatureExtractRequest] = None):
    """Extract voice biomarkers from a base64 PCM microphone chunk."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    audio_data = (req.audio_base64 or req.pcm_base64) if req else None
    sample_rate = req.sample_rate if req and req.sample_rate else 16000
    try:
        return engine.extract_mic_features_realtime(
            audio_data=audio_data,
            patient_id=patient_id,
            sample_rate=sample_rate,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mic feature extraction failed: {exc}") from exc


@app.post("/api/patients/{patient_id}/predict-v2")
@app.post("/api/patients/{patient_id}/predict-with-extended-features")
def predict_with_v2_extended_features(
    patient_id: str,
    req: Optional[PredictWithExtendedFeaturesRequest] = None,
):
    """Run v2 inference with face, voice, and wearable features."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine not ready")
    try:
        return engine.predict_with_face_mic_features(
            patient_id=patient_id,
            face_dict=req.face_features if req else None,
            mic_dict=req.mic_features if req else None,
            wearable_dict=req.wearable_telemetry if req else None,
            end_hour=req.end_hour if req else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"v2 extended prediction failed: {exc}") from exc
