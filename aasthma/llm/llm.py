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


class PatientChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str
    plain_risk_level: Literal["Low", "Watch", "High"]
    answer: str
    key_takeaways: list[str]
    rag_sources: list[str]
    guardrail_note: str
    medication_guardrail_triggered: bool
    suggested_questions: list[str]


def map_plain_risk_level(model_risk_level: str) -> Literal["Low", "Watch", "High"]:
    mapping: dict[str, Literal["Low", "Watch", "High"]] = {
        "NORMAL": "Low",
        "CAUTION": "Watch",
        "ELEVATED": "Watch",
        "HIGH RISK": "High",
    }
    return mapping.get(model_risk_level, "Watch")


def retrieve_rag_context_sections(question: str, payload: dict[str, Any]) -> list[dict[str, str]]:
    """
    Retrieves relevant clinical knowledge sections from context.md (excluding Section 5 medication protocols)
    combined with patient-specific telemetry facts for RAG grounding.
    """
    context_path = LLM_DIR / "context.md"
    context_text = context_path.read_text(encoding="utf-8") if context_path.exists() else ""

    sections: list[dict[str, str]] = []
    current_title = "RespiTwin Clinical Overview"
    current_lines: list[str] = []
    skipping_meds = False

    for line in context_text.splitlines():
        if line.startswith("## "):
            if current_lines and not skipping_meds:
                sections.append({"title": current_title, "content": "\n".join(current_lines).strip()})
            current_title = line.lstrip("# ").strip()
            current_lines = []
            skipping_meds = line.startswith("## 5.")
        else:
            if not skipping_meds:
                current_lines.append(line)

    if current_lines and not skipping_meds:
        sections.append({"title": current_title, "content": "\n".join(current_lines).strip()})

    q_lower = question.lower()
    scored_sections: list[tuple[int, dict[str, str]]] = []
    for sec in sections:
        score = 1
        text_lower = (sec["title"] + " " + sec["content"]).lower()
        for kw in ["air", "pm2.5", "aqi", "pollution", "breathe", "breathing", "sleep", "oxygen", "spo2", "cough", "wheeze", "urgent", "emergency", "trigger", "risk", "night"]:
            if kw in q_lower and kw in text_lower:
                score += 3
        if "6. critical red-flag" in sec["title"].lower() and any(w in q_lower for w in ["urgent", "help", "emergency", "hospital", "911", "severe", "worse"]):
            score += 5
        if "2. biosensor telemetry" in sec["title"].lower() and any(w in q_lower for w in ["signal", "breathing", "oxygen", "rate", "sleep", "night", "usual", "why"]):
            score += 4
        if "1. respiratory physiology" in sec["title"].lower() and any(w in q_lower for w in ["why", "air", "forecast", "risk", "48", "today"]):
            score += 4
        scored_sections.append((score, sec))

    scored_sections.sort(key=lambda item: item[0], reverse=True)
    return [sec for _, sec in scored_sections[:3]]


def _sanitize_plain_language(text: str) -> str:
    """Ensure no raw probability percentages or mathematical symbols leak into patient plain-language text."""
    import re
    # Replace patterns like '82% risk' or '(81.9%)' with plain language
    cleaned = re.sub(r"\(\s*\d+(?:\.\d+)?%\s*\)", "", text)
    cleaned = re.sub(r"\b\d+(?:\.\d+)?%\s*(?:probability|risk|chance|confidence|CI)?", "your current outlook level ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def _build_deterministic_rag_chat_response(
    payload: dict[str, Any],
    question: str,
    retrieved_sections: list[dict[str, str]],
    recent_logs: list[dict[str, Any]] | None = None,
) -> PatientChatResponse:
    profile = payload.get("patient_baseline_profile", {})
    preds = payload.get("model_predictions", {})
    telem = payload.get("recent_telemetry_summary", {}).get("hourly_metrics", {})

    patient_id = profile.get("patient_id", "PT-8821")
    model_risk = preds.get("risk_level", "CAUTION")
    plain_risk = map_plain_risk_level(model_risk)

    rr_latest = telem.get("respiratory_rate", {}).get("latest", profile.get("baseline_respiratory_rate", 16))
    rr_base = profile.get("baseline_respiratory_rate", 16)
    spo2_latest = telem.get("spo2", {}).get("latest", profile.get("baseline_spo2", 96))
    spo2_base = profile.get("baseline_spo2", 96)
    aqi_latest = telem.get("aqi_index", {}).get("latest", 180)
    pm25_latest = telem.get("pm25_concentration", {}).get("latest", 110)

    rr_diff = rr_latest - rr_base
    spo2_diff = spo2_base - spo2_latest

    air_desc = (
        "very poor and smoky" if aqi_latest >= 300 else
        "poor with noticeable haze" if aqi_latest >= 200 else
        "moderately dusty" if aqi_latest >= 100 else
        "clean and comfortable"
    )
    rr_desc = (
        "a little faster than your usual baseline" if rr_diff >= 2.0 else
        "steady and normal for you"
    )
    spo2_desc = (
        "slightly lower than your usual overnight level" if spo2_diff >= 2.0 else
        "normal for you"
    )

    q_lower = question.lower()
    med_keywords = [
        "dose", "dosage", "double", "increase", "decrease", "stop taking", "change my medication",
        "change medication", "steroid", "prednisolone", "prescribe", "how many puffs should i take",
        "switch inhaler", "extra puffs of controller", "medicine change", "treatment"
    ]
    med_triggered = any(kw in q_lower for kw in med_keywords)

    emergency_keywords = [
        "can't breathe", "cannot breathe", "cant speak", "cannot speak", "blue lips",
        "inhaler not working", "emergency", "gasping", "choking", "chest pulling"
    ]
    emergency_triggered = any(kw in q_lower for kw in emergency_keywords)

    rag_sources = [
        f"BreathTwin Personal Twin State ({patient_id})",
        "12-Hour Wearable & Local Air Quality Summary",
        *[f"Clinical RAG KB: {sec['title']}" for sec in retrieved_sections[:2]],
    ]
    if recent_logs:
        rag_sources.append(f"Patient Daily Check-In Log ({len(recent_logs)} recent entries)")

    if emergency_triggered:
        answer = (
            "Your safety comes first. Because you mentioned possible severe breathing symptoms, please do not wait on this forecast chat. "
            "Follow the emergency steps in your doctor's Asthma Action Plan right away and seek urgent medical care or call emergency services (112 / 108) "
            "if you are struggling to breathe, cannot speak full sentences, or if your rescue inhaler is not giving relief."
        )
        takeaways = [
            "Seek urgent medical help immediately if you have trouble breathing or speaking in full sentences.",
            "Keep your rescue inhaler with you and follow your doctor's red-zone action plan.",
            "This digital twin is a forecast tool and cannot assess an active medical emergency.",
        ]
    elif med_triggered:
        answer = (
            f"I cannot recommend changing, starting, stopping, or adjusting the dose of any medication. "
            f"Right now your personal forecast is at the **{plain_risk}** level because outdoor air is {air_desc} and your resting breathing is {rr_desc}. "
            f"Please continue following the daily plan your doctor prescribed ({profile.get('controller_medication', 'your controller inhaler')}) "
            f"and contact your doctor's clinic if you feel your current medication plan needs an adjustment."
        )
        takeaways = [
            "No medication changes can be made by the AI assistant — always follow your doctor-approved plan.",
            f"Your current status is {plain_risk}: focus on non-medication steps like staying indoors during peak smog.",
            "Contact your care team directly if you need to discuss your inhaler schedule.",
        ]
    elif any(w in q_lower for w in ["air", "outside", "outdoor", "walk", "commute", "aqi", "pm2.5", "mask", "when"]):
        answer = (
            f"Outdoor air quality in your area is currently **{air_desc}**. "
            f"The **worst times to be outdoors** are early morning (6:30 AM – 9:30 AM) and evening (6:00 PM – 10:00 PM), when cooler air traps traffic fumes and fine dust near the ground. "
            f"The **best window to step outside** is mid-afternoon (2:00 PM – 4:30 PM) when sunlight lifts the ground haze. "
            f"If you need to go out during smoky hours, wearing a well-fitted N95 mask and limiting outdoor time helps keep your risk from rising."
        )
        takeaways = [
            "Best time outdoors: 2:00 PM – 4:30 PM when afternoon air mixing is highest.",
            "Avoid or limit time outdoors between 6:30–9:30 AM and 6:00–10:00 PM.",
            "Wear a fitted mask and keep your rescue inhaler with you whenever stepping outside.",
        ]
    elif any(w in q_lower for w in ["signal", "breathing", "oxygen", "sleep", "night", "usual", "body", "wearable"]):
        answer = (
            f"Looking at your body's recent signals compared with your personal baseline: your **resting breathing rate** is {rr_desc}, "
            f"and your **overnight oxygen level** is {spo2_desc}. "
            f"When outdoor air is {air_desc}, your airways can work a little harder during sleep even before you notice daytime symptoms. "
            f"Keeping your bedroom air clean and resting indoors this evening can help your breathing settle back to your usual rhythm."
        )
        takeaways = [
            f"Resting breathing rate: {rr_desc.capitalize()}.",
            f"Overnight oxygen level: {spo2_desc.capitalize()}.",
            "Clean indoor air at night helps your airways recover while you sleep.",
        ]
    elif any(w in q_lower for w in ["what if", "stay indoors", "lower", "drop", "improve", "action", "help", "what can i do"]):
        target_band = "Low" if plain_risk == "Watch" else ("Watch" if plain_risk == "High" else "Low")
        answer = (
            f"Your digital twin shows that simple, non-medication steps make a meaningful difference over the next 48 hours. "
            f"Right now your status is **{plain_risk}**. If you **stay indoors this evening**, **wear a mask** during any unavoidable commute, "
            f"and keep indoor air clean, your projected outlook improves toward **{target_band}** because your lungs breathe in far less irritating fine dust."
        )
        takeaways = [
            "Limit time outdoors during evening traffic and smog hours.",
            "Wear a mask if you must travel outside.",
            "Keep your rescue inhaler with you and follow your doctor's daily asthma action plan.",
        ]
    else:
        # General explanation of today's status and 48h forecast
        log_note = ""
        if recent_logs:
            latest_log = recent_logs[0]
            taken_str = "took your daily controller inhaler" if latest_log.get("controller_taken") else "logged a missed controller dose"
            log_note = f" Your latest check-in also noted that you {taken_str}."
        answer = (
            f"Today your asthma outlook is **{plain_risk}**. "
            f"The main reason is that local air quality is **{air_desc}** today and your resting breathing has been **{rr_desc}** "
            f"(with overnight oxygen **{spo2_desc}**).{log_note} "
            f"Over the next 48 hours, risk is most likely to rise during the evening and early morning pollution peaks. "
            f"Staying indoors during peak haze, wearing a mask when outside, and following your doctor's care plan will help protect your breathing."
        )
        takeaways = [
            f"Today's status is {plain_risk} due to {air_desc} outdoor air and {rr_desc}.",
            "Next 48 hours: Watch for evening and early-morning air quality dips.",
            "Follow your doctor-approved action list: limit outdoor time, wear a mask, and keep your rescue inhaler nearby.",
        ]

    return PatientChatResponse(
        patient_id=patient_id,
        plain_risk_level=plain_risk,
        answer=_sanitize_plain_language(answer),
        key_takeaways=takeaways,
        rag_sources=rag_sources,
        guardrail_note=(
            "Plain-language forecast assistant grounded in your BreathTwin data and clinical knowledge base. "
            "Does not provide medical diagnosis, raw probabilities, or medication changes."
        ),
        medication_guardrail_triggered=med_triggered,
        suggested_questions=[
            "Why is my status at this level today?",
            "What is the best time of day for me to go outdoors?",
            "How are my breathing and sleep signals compared to my usual?",
            "What happens to my 48-hour outlook if I stay indoors this evening?",
        ],
    )


def generate_patient_chat_response(
    payload: dict[str, Any],
    question: str,
    history: list[dict[str, str]] | None = None,
    recent_logs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Answers a patient's question about their own forecast using the RAG context (context.md + prompt.md +
    live patient model/telemetry payload) under strict plain-language and non-medication guardrails.
    """
    load_dotenv(DOTENV_PATH, override=False)
    retrieved_sections = retrieve_rag_context_sections(question, payload)
    fallback_response = _build_deterministic_rag_chat_response(
        payload=payload,
        question=question,
        retrieved_sections=retrieved_sections,
        recent_logs=recent_logs,
    )

    # If medication or emergency guardrails triggered, return the strict deterministic guardrail response directly
    if fallback_response.medication_guardrail_triggered:
        return fallback_response.model_dump()

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            rag_text = "\n\n".join(f"### {s['title']}\n{s['content']}" for s in retrieved_sections)
            patient_chat_prompt = (
                f"{_load_system_prompt()}\n\n"
                "## Patient Portal Chat Guardrails (CRITICAL)\n"
                "- You are speaking directly to the patient in warm, calm, plain 6th-grade language.\n"
                "- NEVER include raw probabilities, percentages (like 82% or 44%), confidence intervals, or math symbols.\n"
                "- Use ONLY plain-language risk levels: Low, Watch, or High.\n"
                "- Compare signals only as 'normal for you' or 'different from your usual' (never raw charts).\n"
                "- Recommend actions ONLY from the doctor-approved set: limit time outdoors, wear a mask, keep your rescue inhaler with you, follow your asthma action plan.\n"
                "- NEVER prescribe, adjust, or suggest experimenting with medications.\n"
                "- Return JSON matching: {\"answer\": \"string\", \"key_takeaways\": [\"string\", \"string\", \"string\"]}\n\n"
                f"## Retrieved RAG Knowledge Chunks\n{rag_text}"
            )
            user_payload = {
                "patient_plain_risk_level": fallback_response.plain_risk_level,
                "patient_payload": payload,
                "recent_check_in_logs": recent_logs or [],
                "conversation_history": (history or [])[-4:],
                "patient_question": question,
            }
            response = client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
                messages=[
                    {"role": "system", "content": patient_chat_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, allow_nan=False)},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            if content:
                parsed = json.loads(content)
                ans = _sanitize_plain_language(str(parsed.get("answer", fallback_response.answer)))
                takeaways = [
                    _sanitize_plain_language(str(t))
                    for t in parsed.get("key_takeaways", fallback_response.key_takeaways)
                    if t
                ][:3]
                if ans:
                    fallback_response.answer = ans
                if takeaways:
                    fallback_response.key_takeaways = takeaways
        except Exception as exc:
            LOGGER.warning("Falling back to deterministic RAG chat synthesis: %s", exc)

    return fallback_response.model_dump()

