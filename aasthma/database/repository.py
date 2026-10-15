from typing import Dict, Any, List, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
from aasthma.database.connection import engine, SessionLocal
from aasthma.database.models import PatientModel, TelemetryModel, ClinicalEventModel, PatientDailyLogModel


def get_db_status() -> Dict[str, Any]:
    """Returns database connection status and live table counts."""
    try:
        with engine.connect() as conn:
            n_patients = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar()
            n_history = conn.execute(text("SELECT COUNT(*) FROM patient_history")).scalar()
            n_events = conn.execute(text("SELECT COUNT(*) FROM clinical_events")).scalar()
            n_telemetry = conn.execute(text("SELECT COUNT(*) FROM timeseries_telemetry")).scalar()
            n_logs = conn.execute(text("SELECT COUNT(*) FROM patient_daily_logs")).scalar()
            pg_version = conn.execute(text("SELECT version()")).scalar()

        return {
            "status": "connected",
            "database": "PostgreSQL 16",
            "version": pg_version,
            "counts": {
                "patients": n_patients,
                "patient_history": n_history,
                "clinical_events": n_events,
                "timeseries_telemetry": n_telemetry,
                "patient_daily_logs": n_logs,
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }


def get_patient_by_id(patient_id: str) -> Optional[Dict[str, Any]]:
    """Fetches a patient's static demographic and EHR record from PostgreSQL."""
    db: Session = SessionLocal()
    try:
        p = db.query(PatientModel).filter(PatientModel.patient_id == patient_id).first()
        if not p:
            return None
        return {
            "patient_id": p.patient_id,
            "age": p.age,
            "sex": p.sex,
            "height_cm": p.height_cm,
            "weight_kg": p.weight_kg,
            "bmi": p.bmi,
            "smoking_status": p.smoking_status,
            "pack_years": p.pack_years,
            "asthma_severity": p.asthma_severity,
            "baseline_fev1_pct": p.baseline_fev1_pct,
            "baseline_fev1_fvc": p.baseline_fev1_fvc,
            "baseline_pef_lmin": p.baseline_pef_lmin,
            "baseline_spo2": p.baseline_spo2,
            "baseline_resting_hr": p.baseline_resting_hr,
            "baseline_rr": p.baseline_rr,
            "controller_medication": p.controller_medication,
            "medication_adherence": p.medication_adherence,
            "baseline_rescue_use_weekly": p.baseline_rescue_use_weekly,
            "comorbidity_burden": p.comorbidity_burden,
        }
    finally:
        db.close()


def get_patient_telemetry_series(patient_id: str, max_hour: int = 240) -> List[Dict[str, Any]]:
    """Fetches hourly telemetry readings for a patient from PostgreSQL up to max_hour."""
    query = text("""
        SELECT timestamp_hour, spo2, heart_rate, hrv_rmssd, respiratory_rate,
               skin_temp_c, step_count, activity_intensity, active_minutes,
               sleep_duration_hrs, sleep_interruptions, breathlessness_score,
               cough_severity, wheezing_score, chest_tightness, sputum_severity,
               fatigue_score, rescue_inhaler_puffs, pm25_concentration,
               pm10_concentration, aqi_index
        FROM timeseries_telemetry
        WHERE patient_id = :pid AND timestamp_hour <= :max_hour
        ORDER BY timestamp_hour ASC
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {"pid": patient_id, "max_hour": max_hour})
        rows = [dict(row._mapping) for row in result]
    return rows


def add_patient_daily_log(
    patient_id: str,
    rescue_puffs: int = 0,
    controller_taken: bool = True,
    cough_score: int = 0,
    wheezing_score: int = 0,
    chest_tightness_score: int = 0,
    breathlessness_score: int = 0,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """Records a patient self-reported check-in into PostgreSQL."""
    db: Session = SessionLocal()
    try:
        log_entry = PatientDailyLogModel(
            patient_id=patient_id,
            rescue_puffs=rescue_puffs,
            controller_taken=controller_taken,
            cough_score=cough_score,
            wheezing_score=wheezing_score,
            chest_tightness_score=chest_tightness_score,
            breathlessness_score=breathlessness_score,
            notes=notes,
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return {
            "id": log_entry.id,
            "patient_id": log_entry.patient_id,
            "logged_at": log_entry.logged_at.isoformat() if log_entry.logged_at else None,
            "rescue_puffs": log_entry.rescue_puffs,
            "controller_taken": log_entry.controller_taken,
            "cough_score": log_entry.cough_score,
            "wheezing_score": log_entry.wheezing_score,
            "chest_tightness_score": log_entry.chest_tightness_score,
            "breathlessness_score": log_entry.breathlessness_score,
            "notes": log_entry.notes,
        }
    finally:
        db.close()


def get_patient_daily_logs(patient_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieves patient self-reported check-in history from PostgreSQL."""
    db: Session = SessionLocal()
    try:
        logs = (
            db.query(PatientDailyLogModel)
            .filter(PatientDailyLogModel.patient_id == patient_id)
            .order_by(PatientDailyLogModel.logged_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": l.id,
                "patient_id": l.patient_id,
                "logged_at": l.logged_at.isoformat() if l.logged_at else None,
                "rescue_puffs": l.rescue_puffs,
                "controller_taken": l.controller_taken,
                "cough_score": l.cough_score,
                "wheezing_score": l.wheezing_score,
                "chest_tightness_score": l.chest_tightness_score,
                "breathlessness_score": l.breathlessness_score,
                "notes": l.notes,
            }
            for l in logs
        ]
    finally:
        db.close()
