import hashlib
import secrets
import collections
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
from aasthma.database.connection import engine, SessionLocal, Base
from aasthma.database.models import (
    PatientModel,
    TelemetryModel,
    ClinicalEventModel,
    PatientDailyLogModel,
    UserAccountModel,
    AcousticTelemetryModel,
)

# Resilient in-memory fallback store for acoustic telemetry
_IN_MEMORY_ACOUSTIC_RECORDS: Dict[str, List[Dict[str, Any]]] = collections.defaultdict(list)


def get_db_status() -> Dict[str, Any]:
    """Returns database connection status and live table counts."""
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            n_patients = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar()
            n_history = conn.execute(text("SELECT COUNT(*) FROM patient_history")).scalar()
            n_events = conn.execute(text("SELECT COUNT(*) FROM clinical_events")).scalar()
            n_telemetry = conn.execute(text("SELECT COUNT(*) FROM timeseries_telemetry")).scalar()
            n_logs = conn.execute(text("SELECT COUNT(*) FROM patient_daily_logs")).scalar()
            n_users = conn.execute(text("SELECT COUNT(*) FROM user_accounts")).scalar()
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
                "user_accounts": n_users,
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
        # Ensure patient exists in patients table to satisfy foreign key constraint
        patient_row = db.query(PatientModel).filter(PatientModel.patient_id == patient_id).first()
        if not patient_row:
            stub_patient = PatientModel(
                patient_id=patient_id,
                age=35,
                sex="U",
                height_cm=165.0,
                weight_kg=65.0,
                bmi=23.8,
                asthma_severity="Moderate",
                baseline_fev1_pct=75.0,
                controller_medication="ICS-LABA",
                medication_adherence=0.8,
            )
            db.add(stub_patient)
            db.commit()

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


def add_acoustic_telemetry(
    patient_id: str,
    hourly_cough_count: int = 0,
    cough_severity: int = 0,
    wheeze_percent_duration: float = 0.0,
    sputum_severity: int = 0,
    stridor_detection_index: float = 0.0,
    breathlessness_score: int = 0,
    snoring_nocturnal_score: float = 0.0,
    vocal_hoarseness_jitter: float = 0.8,
    vocal_shimmer_score: float = 2.5,
    ambient_noise_decibels: float = 45.0,
    speech_rate_wpm: float = 130.0,
    respiratory_rate_brpm: float = 16.0,
    source: str = "Web Microphone",
) -> Dict[str, Any]:
    """Records an acoustic respiratory biosensor measurement for the patient."""
    timestamp = datetime.now(timezone.utc).isoformat()
    record = {
        "id": f"ACOUSTIC-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "patient_id": patient_id,
        "recorded_at": timestamp,
        "hourly_cough_count": int(hourly_cough_count),
        "cough_severity": int(cough_severity),
        "wheeze_percent_duration": round(float(wheeze_percent_duration), 2),
        "sputum_severity": int(sputum_severity),
        "stridor_detection_index": round(float(stridor_detection_index), 3),
        "breathlessness_score": int(breathlessness_score),
        "snoring_nocturnal_score": round(float(snoring_nocturnal_score), 2),
        "vocal_hoarseness_jitter": round(float(vocal_hoarseness_jitter), 3),
        "vocal_shimmer_score": round(float(vocal_shimmer_score), 3),
        "ambient_noise_decibels": round(float(ambient_noise_decibels), 1),
        "speech_rate_wpm": round(float(speech_rate_wpm), 1),
        "respiratory_rate_brpm": round(float(respiratory_rate_brpm), 1),
        "source": source,
    }

    # Store in memory cache
    _IN_MEMORY_ACOUSTIC_RECORDS[patient_id].insert(0, record)
    if len(_IN_MEMORY_ACOUSTIC_RECORDS[patient_id]) > 50:
        _IN_MEMORY_ACOUSTIC_RECORDS[patient_id].pop()

    # Attempt PostgreSQL persistence if connected
    try:
        db: Session = SessionLocal()
        try:
            # Ensure patient exists
            patient_row = db.query(PatientModel).filter(PatientModel.patient_id == patient_id).first()
            if not patient_row:
                stub_patient = PatientModel(
                    patient_id=patient_id,
                    age=35,
                    sex="U",
                    height_cm=165.0,
                    weight_kg=65.0,
                    bmi=23.8,
                    asthma_severity="Moderate",
                    baseline_fev1_pct=75.0,
                    controller_medication="ICS-LABA",
                    medication_adherence=0.75,
                )
                db.add(stub_patient)
                db.commit()

            entry = AcousticTelemetryModel(
                patient_id=patient_id,
                hourly_cough_count=hourly_cough_count,
                cough_severity=cough_severity,
                wheeze_percent_duration=wheeze_percent_duration,
                sputum_severity=sputum_severity,
                stridor_detection_index=stridor_detection_index,
                breathlessness_score=breathlessness_score,
                snoring_nocturnal_score=snoring_nocturnal_score,
                vocal_hoarseness_jitter=vocal_hoarseness_jitter,
                vocal_shimmer_score=vocal_shimmer_score,
                ambient_noise_decibels=ambient_noise_decibels,
                speech_rate_wpm=speech_rate_wpm,
                respiratory_rate_brpm=respiratory_rate_brpm,
                source=source,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            record["id"] = entry.id
            if entry.recorded_at:
                record["recorded_at"] = entry.recorded_at.isoformat()
        finally:
            db.close()
    except Exception:
        pass

    return record


def get_patient_acoustic_telemetry(patient_id: str, limit: int = 24) -> List[Dict[str, Any]]:
    """Fetches acoustic telemetry records for a patient from PostgreSQL with in-memory fallback."""
    try:
        db: Session = SessionLocal()
        try:
            records = (
                db.query(AcousticTelemetryModel)
                .filter(AcousticTelemetryModel.patient_id == patient_id)
                .order_by(AcousticTelemetryModel.recorded_at.desc())
                .limit(limit)
                .all()
            )
            if records:
                return [
                    {
                        "id": r.id,
                        "patient_id": r.patient_id,
                        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
                        "hourly_cough_count": r.hourly_cough_count,
                        "cough_severity": r.cough_severity,
                        "wheeze_percent_duration": r.wheeze_percent_duration,
                        "sputum_severity": r.sputum_severity,
                        "stridor_detection_index": r.stridor_detection_index,
                        "breathlessness_score": r.breathlessness_score,
                        "snoring_nocturnal_score": r.snoring_nocturnal_score,
                        "vocal_hoarseness_jitter": r.vocal_hoarseness_jitter,
                        "vocal_shimmer_score": r.vocal_shimmer_score,
                        "ambient_noise_decibels": r.ambient_noise_decibels,
                        "speech_rate_wpm": r.speech_rate_wpm,
                        "respiratory_rate_brpm": r.respiratory_rate_brpm,
                        "source": r.source,
                    }
                    for r in records
                ]
        finally:
            db.close()
    except Exception:
        pass

    # In-memory fallback
    mem = _IN_MEMORY_ACOUSTIC_RECORDS.get(patient_id, [])
    if mem:
        return mem[:limit]

    # Default synthetic baseline acoustic profile if never logged
    now = datetime.now(timezone.utc)
    mock_history = []
    for h in range(limit - 1, -1, -1):
        is_night = (now.hour - h) % 24 >= 22 or (now.hour - h) % 24 <= 6
        coughs = 2 if is_night else 0
        mock_history.append({
            "id": f"DEFAULT-{h}",
            "patient_id": patient_id,
            "recorded_at": now.isoformat(),
            "hourly_cough_count": coughs,
            "cough_severity": 1 if coughs > 0 else 0,
            "wheeze_percent_duration": 1.2 if is_night else 0.0,
            "sputum_severity": 1 if coughs > 0 else 0,
            "stridor_detection_index": 0.04,
            "breathlessness_score": 1 if coughs > 0 else 0,
            "snoring_nocturnal_score": 1.5 if is_night else 0.0,
            "vocal_hoarseness_jitter": 0.85,
            "vocal_shimmer_score": 2.4,
            "ambient_noise_decibels": 42.0,
            "speech_rate_wpm": 132.0,
            "respiratory_rate_brpm": 16.0,
            "source": "Biosensor Baseline",
        })
    return mock_history



def _hash_password(password: str) -> str:
    return hashlib.sha256(f"synclave-salt::{password}".encode("utf-8")).hexdigest()


def _serialize_user(user: UserAccountModel, include_verification_code: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "patient_id": user.patient_id,
        "license_or_clinic": user.license_or_clinic,
        "is_verified": bool(user.is_verified),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
    if include_verification_code:
        payload["verification_code"] = user.verification_code
    return payload


def ensure_auth_tables_and_seed() -> None:
    """Ensures the user_accounts table exists in PostgreSQL and seeds default Doctor and Patient accounts."""
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        defaults = [
            {
                "email": "doctor@synclave.health",
                "full_name": "Dr. Vikram Mehta, MD",
                "role": "doctor",
                "password_hash": _hash_password("doctor123"),
                "patient_id": None,
                "license_or_clinic": "MD-PULM-9042",
                "is_verified": 1,
                "verification_code": "000000",
            },
            {
                "email": "patient0@synclave.health",
                "full_name": "Aarush Sen",
                "role": "patient",
                "password_hash": _hash_password("patient123"),
                "patient_id": "PT-8821",
                "license_or_clinic": "Moderate Persistent Asthma Care Plan",
                "is_verified": 1,
                "verification_code": "000000",
            },
            {
                "email": "patient12@synclave.health",
                "full_name": "Priya Nair",
                "role": "patient",
                "password_hash": _hash_password("patient123"),
                "patient_id": "PT-4409",
                "license_or_clinic": "Allergic Asthma Care Plan",
                "is_verified": 1,
                "verification_code": "000000",
            },
            {
                "email": "patient3@synclave.health",
                "full_name": "Rajesh Sharma",
                "role": "patient",
                "password_hash": _hash_password("patient123"),
                "patient_id": "PT-1923",
                "license_or_clinic": "Severe Persistent Asthma Care Plan",
                "is_verified": 1,
                "verification_code": "000000",
            },
        ]
        for item in defaults:
            existing = db.query(UserAccountModel).filter(UserAccountModel.email == item["email"]).first()
            if not existing:
                db.add(UserAccountModel(**item))
            else:
                existing.full_name = item["full_name"]
                existing.role = item["role"]
                existing.password_hash = item["password_hash"]
                existing.patient_id = item["patient_id"]
                existing.license_or_clinic = item["license_or_clinic"]
                existing.is_verified = 1
        db.commit()
    finally:
        db.close()


def signup_user_account(
    email: str,
    full_name: str,
    role: str,
    password: str,
    patient_id: Optional[str] = None,
    license_or_clinic: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates or updates an unverified user account in PostgreSQL and returns a 6-digit verification code."""
    ensure_auth_tables_and_seed()
    normalized_email = email.strip().lower()
    normalized_role = "doctor" if role.strip().lower() == "doctor" else "patient"
    assigned_patient_id = (patient_id.strip() if patient_id else "PT-8821") if normalized_role == "patient" else None
    code = f"{secrets.randbelow(900000) + 100000}"

    db: Session = SessionLocal()
    try:
        existing = db.query(UserAccountModel).filter(UserAccountModel.email == normalized_email).first()
        if existing and existing.is_verified == 1:
            raise ValueError(f"Account with email '{normalized_email}' is already registered and verified. Please log in.")

        if existing:
            existing.full_name = full_name.strip()
            existing.role = normalized_role
            existing.password_hash = _hash_password(password)
            existing.patient_id = assigned_patient_id
            existing.license_or_clinic = license_or_clinic.strip() if license_or_clinic else None
            existing.is_verified = 0
            existing.verification_code = code
            db.commit()
            db.refresh(existing)
            return _serialize_user(existing, include_verification_code=True)

        new_user = UserAccountModel(
            email=normalized_email,
            full_name=full_name.strip(),
            role=normalized_role,
            password_hash=_hash_password(password),
            patient_id=assigned_patient_id,
            license_or_clinic=license_or_clinic.strip() if license_or_clinic else None,
            is_verified=0,
            verification_code=code,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return _serialize_user(new_user, include_verification_code=True)
    finally:
        db.close()


def verify_user_account(email: str, verification_code: str) -> Dict[str, Any]:
    """Verifies a user's 6-digit code in PostgreSQL and marks the account verified."""
    ensure_auth_tables_and_seed()
    normalized_email = email.strip().lower()
    clean_code = verification_code.strip()

    db: Session = SessionLocal()
    try:
        user = db.query(UserAccountModel).filter(UserAccountModel.email == normalized_email).first()
        if not user:
            raise ValueError(f"No signup found for '{normalized_email}'.")
        if user.is_verified == 1:
            return _serialize_user(user)
        if user.verification_code != clean_code:
            raise ValueError("Invalid verification code. Please check the 6-digit code and try again.")
        user.is_verified = 1
        db.commit()
        db.refresh(user)
        return _serialize_user(user)
    finally:
        db.close()


def login_user_account(email: str, password: str, role: str) -> Dict[str, Any]:
    """Authenticates a verified user against PostgreSQL for the requested role ('doctor' or 'patient')."""
    ensure_auth_tables_and_seed()
    normalized_email = email.strip().lower()
    expected_role = "doctor" if role.strip().lower() == "doctor" else "patient"

    db: Session = SessionLocal()
    try:
        user = db.query(UserAccountModel).filter(UserAccountModel.email == normalized_email).first()
        if not user:
            raise ValueError("Email does not exist.")
        if user.role != expected_role:
            raise ValueError(
                f"This account is registered as a {user.role.upper()}, not {expected_role.upper()}. Please use the {user.role.capitalize()} login panel."
            )
        if user.password_hash != _hash_password(password):
            raise ValueError("Invalid password. Please try again.")
        if user.is_verified != 1:
            raise ValueError("Account is not verified yet. Please enter your 6-digit verification code.")
        return _serialize_user(user)
    finally:
        db.close()


def list_user_accounts() -> List[Dict[str, Any]]:
    """Lists registered accounts stored in PostgreSQL (without password hashes)."""
    ensure_auth_tables_and_seed()
    db: Session = SessionLocal()
    try:
        users = db.query(UserAccountModel).order_by(UserAccountModel.id.asc()).all()
        return [_serialize_user(u) for u in users]
    finally:
        db.close()

