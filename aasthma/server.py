import os
import logging
from typing import Dict, Any, List, Optional, Union
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
from aasthma.database import (
    get_db_status,
    get_patient_by_id,
    get_patient_telemetry_series,
    add_patient_daily_log,
    get_patient_daily_logs,
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

