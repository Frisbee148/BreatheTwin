from sqlalchemy import Column, Integer, BigInteger, String, Float, Boolean, Text, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from aasthma.database.connection import Base


class PatientModel(Base):
    __tablename__ = "patients"

    patient_id = Column(String(50), primary_key=True, index=True)
    age = Column(Integer, nullable=False)
    sex = Column(String(10), nullable=False)
    height_cm = Column(Float)
    weight_kg = Column(Float)
    bmi = Column(Float)
    smoking_status = Column(String(50))
    pack_years = Column(Float)
    asthma_severity = Column(String(50))
    copd_status = Column(Integer, default=0)
    allergic_rhinitis = Column(Integer, default=0)
    baseline_fev1_pct = Column(Float)
    baseline_fev1_fvc = Column(Float)
    baseline_pef_lmin = Column(Float)
    baseline_spo2 = Column(Float)
    baseline_resting_hr = Column(Float)
    baseline_rr = Column(Float)
    controller_medication = Column(String(100))
    medication_adherence = Column(Float)
    baseline_rescue_use_weekly = Column(Float)
    comorbidity_burden = Column(Integer, default=0)

    # Relationships
    history = relationship("PatientHistoryModel", back_populates="patient", cascade="all, delete-orphan")
    events = relationship("ClinicalEventModel", back_populates="patient", cascade="all, delete-orphan")
    telemetry = relationship("TelemetryModel", back_populates="patient", cascade="all, delete-orphan")
    daily_logs = relationship("PatientDailyLogModel", back_populates="patient", cascade="all, delete-orphan")


class PatientHistoryModel(Base):
    __tablename__ = "patient_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    previous_disease = Column(String(100))
    episode_count = Column(Integer, default=0)
    time_since_episode_months = Column(Integer)
    previous_severity = Column(String(50))
    hospitalized = Column(Integer, default=0)
    hospital_stay_duration_days = Column(Integer, default=0)
    intensive_care_required = Column(Integer, default=0)
    previous_complication = Column(String(100))
    residual_symptoms = Column(String(100))
    recovery_status = Column(String(100))

    patient = relationship("PatientModel", back_populates="history")


class ClinicalEventModel(Base):
    __tablename__ = "clinical_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    event_time_hour = Column(Integer, index=True, nullable=False)
    event_type = Column(String(100), nullable=False)
    severity_score = Column(Integer, default=1)

    patient = relationship("PatientModel", back_populates="events")


class TelemetryModel(Base):
    __tablename__ = "timeseries_telemetry"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    timestamp_hour = Column(Integer, index=True, nullable=False)
    spo2 = Column(Float)
    heart_rate = Column(Float)
    hrv_rmssd = Column(Float)
    respiratory_rate = Column(Float)
    skin_temp_c = Column(Float)
    step_count = Column(Integer)
    activity_intensity = Column(Float)
    active_minutes = Column(Integer)
    sleep_duration_hrs = Column(Float)
    sleep_interruptions = Column(Integer)
    breathlessness_score = Column(Integer)
    cough_severity = Column(Integer)
    wheezing_score = Column(Integer)
    chest_tightness = Column(Integer)
    sputum_severity = Column(Integer)
    fatigue_score = Column(Integer)
    rescue_inhaler_puffs = Column(Integer)
    pm25_concentration = Column(Float)
    pm10_concentration = Column(Float)
    aqi_index = Column(Integer)

    patient = relationship("PatientModel", back_populates="telemetry")

    __table_args__ = (
        Index("idx_patient_hour", "patient_id", "timestamp_hour"),
    )


class PatientDailyLogModel(Base):
    """
    Patient Self-Reported Outcomes (PRO) Log Table
    Allows patients to enter their own daily check-ins, rescue inhaler puffs, and symptoms.
    """
    __tablename__ = "patient_daily_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    rescue_puffs = Column(Integer, default=0)
    controller_taken = Column(Boolean, default=True)
    cough_score = Column(Integer, default=0)
    wheezing_score = Column(Integer, default=0)
    chest_tightness_score = Column(Integer, default=0)
    breathlessness_score = Column(Integer, default=0)
    notes = Column(Text, nullable=True)

    patient = relationship("PatientModel", back_populates="daily_logs")
