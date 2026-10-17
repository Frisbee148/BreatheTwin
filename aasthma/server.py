import os
import logging
from typing import Dict, Any, List, Optional
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


class CreatePatientRequest(BaseModel):
    name: str = Field(default="New Patient", description="Full name of patient")
    age: int = Field(default=40, ge=5, le=105)
    gender: str = Field(default="Male")
    city: str = Field(default="New Delhi")
    station: Optional[str] = None
    asthma_severity: str = Field(default="Moderate_Persistent")
    baseline_fev1_pct: float = Field(default=72.0, ge=20.0, le=120.0)
    baseline_fev1_fvc: float = Field(default=0.72, ge=0.3, le=1.0)
    baseline_pef_lmin: float = Field(default=380.0, ge=100.0, le=800.0)
    baseline_spo2: float = Field(default=95.0, ge=80.0, le=100.0)
    baseline_resting_hr: int = Field(default=74, ge=45, le=140)
    baseline_rr: int = Field(default=16, ge=8, le=40)
    controller_medication: str = Field(default="Budesonide_Formoterol_200_6")
    controller_adherence: int = Field(default=75, ge=0, le=100)
    smoking_status: str = Field(default="Never")
    pack_years: int = Field(default=0, ge=0, le=100)
    copd_status: bool = False
    comorbidity_burden: int = Field(default=1, ge=0, le=5)
    flare_ups_last_year: int = Field(default=1, ge=0, le=20)
    hospitalized: bool = False
    allergens: Optional[str] = "Dust Mites, Vehicle Exhaust"


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
    the latent airway inflammation differential equation and re-scoring neural risk (PRD FR-7).
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
