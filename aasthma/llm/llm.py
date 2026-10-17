import json
import logging
import os
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, ValidationError

from aasthma.inference.inference_engine import InferenceEngine


LOGGER = logging.getLogger(__name__)
LLM_DIR = Path(__file__).resolve().parent
DOTENV_PATH = LLM_DIR.parent / ".env"
DEFAULT_MODEL = "gpt-4o"
TELEMETRY_FIELDS = {
    "respiratory_rate": "breaths/min",
    "heart_rate": "bpm",
    "hrv_rmssd": "ms",
    "spo2": "%",
    "cough_severity": "ordinal score",
    "wheezing_score": "ordinal score",
    "breathlessness_score": "ordinal score",
    "chest_tightness": "ordinal score",
    "rescue_inhaler_puffs": "puffs/hour",
    "pm25_concentration": "µg/m³",
    "aqi_index": "index",
}


class BreathingExercise(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    purpose: str
    how_to_do_it: list[str]
    duration: str


class MedicationGuidance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    note: str


class CopilotReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str
    clinical_status: Literal["Stable", "Warning", "High Risk"]
    risk_level: Literal["Low", "Medium", "High"]
    summary_reason: str
    precautions: list[str]
    triggers_to_avoid: list[str]
    breathing_exercise: BreathingExercise | None
    medication_guidance: MedicationGuidance
    emergency_warning: str


class CopilotConfigurationError(Exception):
    """The server cannot configure the LLM provider."""


class CopilotProviderError(Exception):
    """The LLM provider request failed."""


class CopilotResponseError(Exception):
    """The LLM response did not match the required report schema."""


def _summarize_telemetry(raw_window: pd.DataFrame) -> dict[str, Any]:
    missing_fields = set(TELEMETRY_FIELDS).difference(raw_window.columns)
    if missing_fields:
        raise ValueError(
            f"Patient telemetry is missing required fields: {', '.join(sorted(missing_fields))}"
        )

    metrics: dict[str, Any] = {}
    for field, unit in TELEMETRY_FIELDS.items():
        values = pd.to_numeric(raw_window[field], errors="coerce").dropna()
        if values.empty:
            metrics[field] = {"unit": unit, "observations": 0}
            continue

        metrics[field] = {
            "unit": unit,
            "observations": int(values.size),
            "mean": round(float(values.mean()), 2),
            "minimum": round(float(values.min()), 2),
            "maximum": round(float(values.max()), 2),
            "first": round(float(values.iloc[0]), 2),
            "latest": round(float(values.iloc[-1]), 2),
            "change": round(float(values.iloc[-1] - values.iloc[0]), 2),
        }

    return {
        "period": "model_input_window",
        "duration_hours": int(len(raw_window)),
        "hourly_metrics": metrics,
    }


def build_patient_copilot_payload(
    engine: InferenceEngine,
    patient_id: str,
    end_hour: int,
) -> dict[str, Any]:
    metadata = engine.get_patient_metadata(patient_id)
    prediction = engine.predict_patient(patient_id, end_hour=end_hour)
    _, _, raw_window = engine.get_patient_window(patient_id, end_hour=end_hour)

    patient_baseline = {
        "patient_id": patient_id,
        "age": metadata["age"],
        "gender": metadata["gender"],
        "bmi": metadata["bmi"],
        "asthma_severity": metadata["severity"],
        "smoking_status": metadata["smoking_status"],
        "pack_years": metadata["pack_years"],
        "allergic_rhinitis": metadata["allergic_rhinitis"],
        "copd_status": metadata["copd_status"],
        "controller_medication": metadata["controller_medication"],
        "controller_adherence_pct": metadata["controller_adherence"],
        "baseline_fev1_pct_predicted": metadata["baseline_fev1_pct"],
        "baseline_fev1_fvc": metadata["baseline_fev1_fvc"],
        "baseline_pef_l_min": metadata["baseline_pef_lmin"],
        "baseline_spo2": metadata["baseline_spo2"],
        "baseline_resting_heart_rate": metadata["baseline_resting_hr"],
        "baseline_respiratory_rate": metadata["baseline_rr"],
        "baseline_rescue_use_weekly": metadata["baseline_rescue_use_weekly"],
        "comorbidity_burden": metadata["comorbidity_burden"],
        "previous_disease": metadata["previous_disease"],
        "previous_hospitalization": metadata["hospitalized"],
    }

    return {
        "patient_baseline_profile": patient_baseline,
        "model_predictions": {
            "risk_24h_pct": prediction["risk24h"],
            "risk_24h_interval_pct": prediction["risk24hInterval"],
            "risk_48h_pct": prediction["risk48h"],
            "risk_48h_interval_pct": prediction["risk48hInterval"],
            "risk_level": prediction["riskLevel"],
            "severity_class": prediction["severityClass"],
            "estimated_inflammation_state": prediction["estimatedInflammationState"],
            "model_attribution_drivers": prediction["shapReasons"],
        },
        "recent_telemetry_summary": _summarize_telemetry(raw_window),
        "evaluation_hour": end_hour,
    }


def _load_system_prompt() -> str:
    prompt_path = LLM_DIR / "prompt.md"
    context_path = LLM_DIR / "context.md"
    prompt_text = prompt_path.read_text(encoding="utf-8")
    context_text = context_path.read_text(encoding="utf-8")

    # Keep the provided physiology and red-flag context, but exclude its medication protocols.
    context_lines = context_text.splitlines()
    safe_context: list[str] = []
    skipping_medication_protocols = False
    for line in context_lines:
        if line.startswith("## 5."):
            skipping_medication_protocols = True
        elif skipping_medication_protocols and line.startswith("## "):
            skipping_medication_protocols = False
        if not skipping_medication_protocols:
            safe_context.append(line)

    return (
        f"{prompt_text}\n\n"
        "## Reference context\n"
        "The following supplied clinical notes are unverified background only. Do not use them "
        "to diagnose, prescribe, change medication, infer missing patient facts, or override the "
        "model output. Mention only facts supported by the request payload. Model risk is a "
        "forecast, not proof of an active emergency. If emergency symptoms were not supplied, "
        "do not claim they are present.\n\n"
        f"{os.linesep.join(safe_context)}"
    )


def generate_copilot_report(payload: dict[str, Any]) -> dict[str, Any]:
    load_dotenv(DOTENV_PATH, override=False)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise CopilotConfigurationError(
            "OPENAI_API_KEY is not configured in the backend environment."
        )

    try:
        from openai import OpenAI, OpenAIError
    except ImportError as exc:
        raise CopilotConfigurationError(
            "The OpenAI Python package is not installed in the backend environment."
        ) from exc

    client = OpenAI(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            messages=[
                {"role": "system", "content": _load_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        "Create the patient-specific report from this backend model output "
                        "and patient data. Return only the requested JSON object.\n\n"
                        f"{json.dumps(payload, ensure_ascii=False, allow_nan=False)}"
                    ),
                },
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except OpenAIError as exc:
        LOGGER.exception("OpenAI report generation request failed")
        raise CopilotProviderError("The LLM provider request failed.") from exc

    report_text = response.choices[0].message.content
    if not report_text:
        raise CopilotResponseError("The LLM provider returned an empty report.")

    try:
        report = CopilotReport.model_validate_json(report_text)
    except (ValidationError, ValueError) as exc:
        LOGGER.exception("LLM report did not match the expected report schema")
        raise CopilotResponseError(
            "The LLM provider returned a report with an invalid format."
        ) from exc

    if report.patient_id != payload["patient_baseline_profile"]["patient_id"]:
        raise CopilotResponseError("The LLM report returned a different patient ID.")

    expected_classification = {
        "NORMAL": ("Stable", "Low"),
        "CAUTION": ("Warning", "Medium"),
        "ELEVATED": ("Warning", "Medium"),
        "HIGH RISK": ("High Risk", "High"),
    }
    model_risk_level = payload["model_predictions"]["risk_level"]
    if model_risk_level not in expected_classification:
        raise CopilotResponseError("The model returned an unsupported risk category.")
    if (report.clinical_status, report.risk_level) != expected_classification[model_risk_level]:
        raise CopilotResponseError("The report risk category does not match the model output.")

    report.breathing_exercise = None
    report.medication_guidance = MedicationGuidance(
        action="No medication change is recommended by this AI-generated report.",
        note="Medication decisions must follow the patient's clinician-approved plan.",
    )
    return report.model_dump()
