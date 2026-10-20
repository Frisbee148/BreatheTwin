"""
LLM Clinical Feature Extractor & Physiological Perturbation Calibrator.

Converts unstructured plain-text clinical notes or outlier conditions (e.g., Typhoid fever,
Dengue, acute bacterial gastroenteritis, severe dehydration, beta-blocker exposure)
into structured physiological feature deltas, static EHR overrides, and mechanistic ODE
latent inflammation drivers.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

LOGGER = logging.getLogger(__name__)
LLM_DIR = Path(__file__).resolve().parent
DOTENV_PATH = LLM_DIR.parent / ".env"
DEFAULT_MODEL = "gpt-4o"


class PhysiologicalDeltas(BaseModel):
    model_config = ConfigDict(extra="ignore")

    delta_skin_temp_c: float = Field(
        default=0.0, ge=-1.5, le=4.5, description="Shift in skin/core temperature in Celsius"
    )
    delta_resting_hr: float = Field(
        default=0.0, ge=-20.0, le=55.0, description="Shift in resting heart rate (bpm)"
    )
    delta_respiratory_rate: float = Field(
        default=0.0, ge=-4.0, le=16.0, description="Shift in respiratory rate (breaths/min)"
    )
    delta_spo2: float = Field(
        default=0.0, ge=-8.0, le=2.0, description="Shift in peripheral oxygen saturation (%)"
    )
    hrv_reduction_factor: float = Field(
        default=1.0,
        ge=0.25,
        le=1.1,
        description="Autonomic tone multiplier applied to HRV RMSSD (e.g., 0.65 = 35% drop)",
    )
    delta_cough_severity: float = Field(default=0.0, ge=0.0, le=3.0)
    delta_wheezing_score: float = Field(default=0.0, ge=0.0, le=3.0)
    delta_breathlessness_score: float = Field(default=0.0, ge=0.0, le=3.0)
    delta_chest_tightness: float = Field(default=0.0, ge=0.0, le=3.0)
    delta_fatigue_score: float = Field(default=0.0, ge=0.0, le=3.0)
    hydration_status: Literal["normal", "mild_dehydration", "severe_dehydration"] = "normal"


class MechanisticModifiers(BaseModel):
    model_config = ConfigDict(extra="ignore")

    systemic_inflammation_load: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Systemic cytokine driver delta_systemic injected into latent airway ODE",
    )
    airway_hyperresponsiveness_factor: float = Field(
        default=1.0,
        ge=0.8,
        le=2.8,
        description="Multiplier beta_AHR scaling bronchial sensitivity to PM2.5 particulate dose",
    )
    medication_absorption_efficiency: float = Field(
        default=1.0,
        ge=0.3,
        le=1.0,
        description="Multiplier eta_absorption scaling controller medication clearance/efficacy",
    )


class DerivedFeatureItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    feature_name: str
    feature_key: str
    category: Literal["STATIC_EHR", "DYNAMIC_WEARABLE", "MECHANISTIC_ODE"]
    baseline_value: str
    derived_value: str
    delta_display: str
    physiological_rationale: str


class ClinicalNoteExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    primary_condition: str
    icd10_code: str = "R69"
    is_outlier_condition: bool = True
    severity_tier: Literal["Mild", "Moderate", "Severe", "Critical"] = "Moderate"
    clinical_summary: str
    pathophysiological_mechanism: str
    vitals_deltas: PhysiologicalDeltas
    mechanistic_modifiers: MechanisticModifiers
    comorbidity_burden_delta: int = Field(default=1, ge=0, le=3)
    extracted_symptoms: List[str] = Field(default_factory=list)
    extraction_source: str = "clinical_ontology_engine"


CLINICAL_EXTRACTION_SYSTEM_PROMPT = """You are a Clinical Pathophysiology & Digital Twin Feature Extraction Engine for BreathTwin.
Your task is to convert free-text clinical notes or outlier diagnoses (e.g., Typhoid fever, Dengue, acute gastroenteritis, bacterial pneumonia, beta-blocker exposure, dehydration, systemic infections) into a strict JSON object matching the ClinicalNoteExtraction schema.

Calibrate physiological perturbations accurately:
1. Systemic febrile infections (e.g. Typhoid / Salmonella Typhi, Dengue, Malaria, Sepsis):
   - Elevate `delta_skin_temp_c` (+1.5 to +3.0 C depending on fever severity).
   - Elevate `delta_resting_hr` (+15 to +35 bpm due to febrile metabolic demand & dehydration).
   - Elevate `delta_respiratory_rate` (+3.0 to +8.0 breaths/min due to compensatory hyperventilation & metabolic acidosis).
   - Reduce `hrv_reduction_factor` (0.55 to 0.78 due to vagal withdrawal & sympathetic surge).
   - Elevate `systemic_inflammation_load` (0.35 to 0.80 due to circulating IL-6, TNF-alpha, IFN-gamma spillover sensitizing bronchial smooth muscle).
   - Elevate `airway_hyperresponsiveness_factor` (1.25 to 1.85).
2. Gastrointestinal fluid loss / dehydration / vomiting:
   - Set `hydration_status` to "mild_dehydration" or "severe_dehydration".
   - Reduce `medication_absorption_efficiency` (0.65 to 0.85) and dry airway mucociliary clearance.
3. Respiratory co-infections or bronchospastic triggers (e.g. Viral Pneumonia, Acute Bronchitis, non-selective Beta-Blockers):
   - Directly elevate `delta_cough_severity`, `delta_wheezing_score`, `delta_breathlessness_score`, `delta_chest_tightness`, and `delta_spo2` (-1.5 to -4.5%).

Return ONLY valid JSON with keys:
- primary_condition (string)
- icd10_code (string)
- is_outlier_condition (boolean)
- severity_tier ("Mild" | "Moderate" | "Severe" | "Critical")
- clinical_summary (string)
- pathophysiological_mechanism (string)
- vitals_deltas (object with delta_skin_temp_c, delta_resting_hr, delta_respiratory_rate, delta_spo2, hrv_reduction_factor, delta_cough_severity, delta_wheezing_score, delta_breathlessness_score, delta_chest_tightness, delta_fatigue_score, hydration_status)
- mechanistic_modifiers (object with systemic_inflammation_load, airway_hyperresponsiveness_factor, medication_absorption_efficiency)
- comorbidity_burden_delta (int 0..3)
- extracted_symptoms (array of strings)
"""


def _deterministic_clinical_extraction(note_text: str) -> ClinicalNoteExtraction:
    """
    Deterministic clinical ontology & physiological rule engine.
    Handles known outlier profiles (Typhoid, Dengue, Gastroenteritis, Pneumonia, Beta-blocker, etc.)
    as well as arbitrary symptom combinations parsed from natural language.
    """
    text_lower = note_text.lower()

    # Parse explicit temperature mentions (e.g. 102.5 F, 103F, 39.2 C)
    explicit_temp_delta: Optional[float] = None
    f_match = re.search(r"(\d{2,3}(?:\.\d+)?)\s*°?\s*f\b", text_lower)
    c_match = re.search(r"(3[789](?:\.\d+)?|4[01](?:\.\d+)?)\s*°?\s*c\b", text_lower)
    if f_match:
        temp_f = float(f_match.group(1))
        if 98.0 <= temp_f <= 107.0:
            explicit_temp_delta = round(max(0.0, (temp_f - 98.6) * (5.0 / 9.0)), 2)
    elif c_match:
        temp_c = float(c_match.group(1))
        explicit_temp_delta = round(max(0.0, temp_c - 37.0), 2)

    # Parse explicit heart rate mentions (e.g., 115 bpm, hr 120)
    explicit_hr_delta: Optional[float] = None
    hr_match = re.search(r"(\d{2,3})\s*bpm\b", text_lower)
    if hr_match:
        hr_val = float(hr_match.group(1))
        if 50 <= hr_val <= 180:
            explicit_hr_delta = round(max(-10.0, min(50.0, hr_val - 76.0)), 1)

    if any(k in text_lower for k in ["typhoid", "salmonella", "enteric fever", "widal"]):
        temp_d = explicit_temp_delta if explicit_temp_delta is not None else 2.2
        hr_d = explicit_hr_delta if explicit_hr_delta is not None else 24.0
        return ClinicalNoteExtraction(
            primary_condition="Typhoid Fever (Enteric Salmonella Typhi Infection)",
            icd10_code="A01.0",
            is_outlier_condition=True,
            severity_tier="Severe",
            clinical_summary=(
                "Acute systemic Salmonella Typhi enteric infection presenting with sustained step-ladder pyrexia, "
                "systemic endotoxemia, volume depletion, and compensatory cardiorespiratory stress."
            ),
            pathophysiological_mechanism=(
                "Circulating lipopolysaccharide (LPS) endotoxin and systemic IL-6 / TNF-α cytokine release lowers "
                "bronchial smooth muscle threshold to inhaled PM2.5, while febrile acidosis increases minute ventilation "
                "demand (+RR) and dehydrates airway mucosal lining."
            ),
            vitals_deltas=PhysiologicalDeltas(
                delta_skin_temp_c=temp_d,
                delta_resting_hr=hr_d,
                delta_respiratory_rate=5.2,
                delta_spo2=-1.8,
                hrv_reduction_factor=0.64,
                delta_cough_severity=1.0,
                delta_wheezing_score=1.0,
                delta_breathlessness_score=1.2,
                delta_chest_tightness=1.0,
                delta_fatigue_score=2.4,
                hydration_status="severe_dehydration" if "severe" in text_lower or "dehydrat" in text_lower else "mild_dehydration",
            ),
            mechanistic_modifiers=MechanisticModifiers(
                systemic_inflammation_load=0.68,
                airway_hyperresponsiveness_factor=1.55,
                medication_absorption_efficiency=0.78,
            ),
            comorbidity_burden_delta=2,
            extracted_symptoms=[
                "Sustained Step-Ladder Fever",
                "Systemic Endotoxemia",
                "Dehydration / Mucosal Dryness",
                "Compensatory Tachypnea",
                "Autonomic HRV Suppression",
            ],
            extraction_source="clinical_ontology_engine",
        )

    if any(k in text_lower for k in ["dengue", "thrombocytopenia", "platelet", "breakbone"]):
        temp_d = explicit_temp_delta if explicit_temp_delta is not None else 2.5
        hr_d = explicit_hr_delta if explicit_hr_delta is not None else 28.0
        return ClinicalNoteExtraction(
            primary_condition="Acute Dengue Fever with Capillary Leak Stress",
            icd10_code="A97.1",
            is_outlier_condition=True,
            severity_tier="Severe",
            clinical_summary=(
                "Acute flavivirus infection with high-grade biphasic fever, endothelial capillary permeability shift, "
                "hemoconcentration, and elevated pulmonary interstitial fluid pressure."
            ),
            pathophysiological_mechanism=(
                "NS1-mediated endothelial glycocalyx disruption increases pulmonary microvascular permeability and "
                "peribronchial edema, amplifying airway narrowing and reducing alveolar gas exchange efficiency."
            ),
            vitals_deltas=PhysiologicalDeltas(
                delta_skin_temp_c=temp_d,
                delta_resting_hr=hr_d,
                delta_respiratory_rate=5.8,
                delta_spo2=-2.4,
                hrv_reduction_factor=0.58,
                delta_cough_severity=1.0,
                delta_wheezing_score=1.2,
                delta_breathlessness_score=1.6,
                delta_chest_tightness=1.4,
                delta_fatigue_score=2.6,
                hydration_status="severe_dehydration",
            ),
            mechanistic_modifiers=MechanisticModifiers(
                systemic_inflammation_load=0.74,
                airway_hyperresponsiveness_factor=1.65,
                medication_absorption_efficiency=0.82,
            ),
            comorbidity_burden_delta=2,
            extracted_symptoms=[
                "High-Grade Fever",
                "Capillary Leak / Peribronchial Edema",
                "Thrombocytopenia Stress",
                "Resting Tachycardia",
                "Exertional Dyspnea",
            ],
            extraction_source="clinical_ontology_engine",
        )

    if any(k in text_lower for k in ["gastroenteritis", "food poisoning", "diarrhea", "vomiting", "cholera", "stomach"]):
        temp_d = explicit_temp_delta if explicit_temp_delta is not None else 1.1
        hr_d = explicit_hr_delta if explicit_hr_delta is not None else 18.0
        return ClinicalNoteExtraction(
            primary_condition="Acute Infectious Gastroenteritis & Electrolyte Depletion",
            icd10_code="A09",
            is_outlier_condition=True,
            severity_tier="Moderate",
            clinical_summary=(
                "Acute gastrointestinal infection with fluid and electrolyte depletion, thickening bronchial secretions "
                "and impairing mucociliary clearance."
            ),
            pathophysiological_mechanism=(
                "Extracellular volume contraction causes hyperviscous airway mucus plugging and reduced systemic drug "
                "bioavailability, while vagal enteric reflexes increase bronchial tone."
            ),
            vitals_deltas=PhysiologicalDeltas(
                delta_skin_temp_c=temp_d,
                delta_resting_hr=hr_d,
                delta_respiratory_rate=3.4,
                delta_spo2=-1.1,
                hrv_reduction_factor=0.72,
                delta_cough_severity=0.8,
                delta_wheezing_score=0.9,
                delta_breathlessness_score=1.0,
                delta_chest_tightness=0.8,
                delta_fatigue_score=2.0,
                hydration_status="severe_dehydration",
            ),
            mechanistic_modifiers=MechanisticModifiers(
                systemic_inflammation_load=0.45,
                airway_hyperresponsiveness_factor=1.35,
                medication_absorption_efficiency=0.68,
            ),
            comorbidity_burden_delta=1,
            extracted_symptoms=[
                "Severe Dehydration",
                "Electrolyte Imbalance",
                "Mucociliary Impairment",
                "Orthostatic Tachycardia",
            ],
            extraction_source="clinical_ontology_engine",
        )

    if any(k in text_lower for k in ["pneumonia", "covid", "sars", "influenza", "viral", "lower respiratory"]):
        temp_d = explicit_temp_delta if explicit_temp_delta is not None else 2.0
        hr_d = explicit_hr_delta if explicit_hr_delta is not None else 22.0
        return ClinicalNoteExtraction(
            primary_condition="Acute Viral/Bacterial Lower Respiratory Co-Infection",
            icd10_code="J18.9",
            is_outlier_condition=True,
            severity_tier="Critical",
            clinical_summary=(
                "Lower respiratory tract parenchymal co-infection causing direct bronchial epithelial shedding, "
                "alveolar exudate, and marked ventilation-perfusion mismatch."
            ),
            pathophysiological_mechanism=(
                "Direct respiratory epithelial necrosis exposes sub-epithelial irritant receptors and triggers intense "
                "neurogenic bronchospasm alongside neutrophilic/eosinophilic airway infiltration."
            ),
            vitals_deltas=PhysiologicalDeltas(
                delta_skin_temp_c=temp_d,
                delta_resting_hr=hr_d,
                delta_respiratory_rate=6.8,
                delta_spo2=-3.5,
                hrv_reduction_factor=0.55,
                delta_cough_severity=2.0,
                delta_wheezing_score=1.8,
                delta_breathlessness_score=2.0,
                delta_chest_tightness=1.8,
                delta_fatigue_score=2.5,
                hydration_status="mild_dehydration",
            ),
            mechanistic_modifiers=MechanisticModifiers(
                systemic_inflammation_load=0.82,
                airway_hyperresponsiveness_factor=1.90,
                medication_absorption_efficiency=0.72,
            ),
            comorbidity_burden_delta=2,
            extracted_symptoms=[
                "Bronchial Epithelial Shedding",
                "Hypoxemic Desaturation",
                "Tachypnea",
                "Productive Cough & Wheeze",
            ],
            extraction_source="clinical_ontology_engine",
        )

    if any(k in text_lower for k in ["beta-blocker", "beta blocker", "propranolol", "metoprolol", "atenolol", "nsaids", "aspirin"]):
        return ClinicalNoteExtraction(
            primary_condition="Pharmacological Bronchospastic Trigger (Beta-Adrenergic Blockade / NSAID)",
            icd10_code="T44.7X5A",
            is_outlier_condition=True,
            severity_tier="Severe",
            clinical_summary=(
                "Exogenous pharmacological antagonism of bronchial beta-2 adrenergic receptors or leukotriene overproduction, "
                "blunting endogenous bronchodilation and rescue SABA efficacy."
            ),
            pathophysiological_mechanism=(
                "Competitive blockade of bronchial smooth muscle beta-2 receptors causes unopposed cholinergic "
                "bronchoconstriction and diminishes responsiveness to inhaled beta-agonist therapy."
            ),
            vitals_deltas=PhysiologicalDeltas(
                delta_skin_temp_c=0.1,
                delta_resting_hr=-8.0 if "beta" in text_lower else 10.0,
                delta_respiratory_rate=4.6,
                delta_spo2=-2.1,
                hrv_reduction_factor=0.78,
                delta_cough_severity=1.4,
                delta_wheezing_score=2.0,
                delta_breathlessness_score=1.8,
                delta_chest_tightness=2.0,
                delta_fatigue_score=1.3,
                hydration_status="normal",
            ),
            mechanistic_modifiers=MechanisticModifiers(
                systemic_inflammation_load=0.58,
                airway_hyperresponsiveness_factor=1.75,
                medication_absorption_efficiency=0.52,
            ),
            comorbidity_burden_delta=1,
            extracted_symptoms=[
                "Receptor-Mediated Bronchospasm",
                "Blunted Rescue Inhaler Response",
                "Acute Chest Tightness",
                "Expiratory Wheezing",
            ],
            extraction_source="clinical_ontology_engine",
        )

    # Generic dynamic natural language symptom parser for custom outlier notes
    has_fever = any(w in text_lower for w in ["fever", "febrile", "pyrexia", "temperature", "chills", "101", "102", "103"])
    has_dehydration = any(w in text_lower for w in ["dehydrat", "fluid", "thirst", "dry", "sweat"])
    has_tachy = any(w in text_lower for w in ["tachycardia", "palpitation", "fast heart", "racing heart", "pulse"])
    has_dyspnea = any(w in text_lower for w in ["breath", "dyspnea", "tight", "wheez", "cough", "hypox", "spo2"])
    has_fatigue = any(w in text_lower for w in ["fatigue", "letharg", "weak", "exhaust", "malaise", "body ache", "myalgia"])

    temp_d = explicit_temp_delta if explicit_temp_delta is not None else (1.8 if has_fever else 0.4)
    hr_d = explicit_hr_delta if explicit_hr_delta is not None else (20.0 if (has_fever or has_tachy) else 10.0)
    rr_d = 4.2 if (has_fever or has_dyspnea) else 2.5
    spo2_d = -2.0 if has_dyspnea else -1.0

    symptoms: List[str] = []
    if has_fever:
        symptoms.append("Acute Febrile State")
    if has_dehydration:
        symptoms.append("Fluid / Volume Depletion")
    if has_tachy:
        symptoms.append("Sympathetic Tachycardia")
    if has_dyspnea:
        symptoms.append("Heightened Airway Resistance")
    if has_fatigue:
        symptoms.append("Systemic Metabolic Fatigue")
    if not symptoms:
        symptoms = ["Systemic Clinical Stress", "Autonomic Perturbation", "Inflammatory Sensitization"]

    short_title = note_text.strip().split(".")[0][:68]
    return ClinicalNoteExtraction(
        primary_condition=f"Outlier Clinical Syndrome: {short_title}",
        icd10_code="R68.89",
        is_outlier_condition=True,
        severity_tier="Severe" if (has_fever and has_dyspnea) else "Moderate",
        clinical_summary=(
            f"Clinician-reported outlier presentation ({note_text.strip()[:140]}). "
            "Mapped to systemic inflammatory stress, autonomic tone shift, and heightened bronchial reactivity."
        ),
        pathophysiological_mechanism=(
            "Systemic physiological stress increases neurohumoral sympathetic drive and inflammatory mediator "
            "circulation, lowering the threshold for particulate-induced bronchoconstriction."
        ),
        vitals_deltas=PhysiologicalDeltas(
            delta_skin_temp_c=temp_d,
            delta_resting_hr=hr_d,
            delta_respiratory_rate=rr_d,
            delta_spo2=spo2_d,
            hrv_reduction_factor=0.68 if has_fever else 0.78,
            delta_cough_severity=1.2 if has_dyspnea else 0.6,
            delta_wheezing_score=1.2 if has_dyspnea else 0.6,
            delta_breathlessness_score=1.4 if has_dyspnea else 0.8,
            delta_chest_tightness=1.2 if has_dyspnea else 0.7,
            delta_fatigue_score=2.0 if has_fatigue else 1.2,
            hydration_status="mild_dehydration" if has_dehydration else "normal",
        ),
        mechanistic_modifiers=MechanisticModifiers(
            systemic_inflammation_load=0.56 if has_fever else 0.40,
            airway_hyperresponsiveness_factor=1.45 if has_fever else 1.28,
            medication_absorption_efficiency=0.80 if has_dehydration else 0.90,
        ),
        comorbidity_burden_delta=1,
        extracted_symptoms=symptoms,
        extraction_source="clinical_ontology_engine",
    )


def _extract_json_from_text(text: str) -> Dict[str, Any]:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()
    else:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            text = match.group(0).strip()
    text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    return json.loads(text)


def _extract_clinical_features_hf(
    note_text: str,
    token: str,
    patient_profile: Optional[Dict[str, Any]] = None,
    baseline_estimate: Optional[ClinicalNoteExtraction] = None,
) -> Optional[ClinicalNoteExtraction]:
    from huggingface_hub import InferenceClient

    candidate_models = [
        os.getenv("HF_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
        "Qwen/Qwen2.5-72B-Instruct",
        "google/gemma-2-2b-it",
    ]

    ref_dict = baseline_estimate.model_dump() if baseline_estimate else {}
    user_prompt = (
        f"You are a clinical pulmonologist & digital twin feature extractor.\n"
        f"Extract and calibrate physiological feature perturbations from this clinical observation note:\n"
        f"\"{note_text}\"\n\n"
        f"Reference clinical ontology estimate:\n"
        f"{json.dumps(ref_dict, ensure_ascii=False)}\n\n"
        f"Return ONLY a single valid JSON object matching the ClinicalNoteExtraction schema with keys:\n"
        f"primary_condition, icd10_code, is_outlier_condition, severity_tier, clinical_summary, "
        f"pathophysiological_mechanism, vitals_deltas, mechanistic_modifiers, comorbidity_burden_delta, extracted_symptoms."
    )

    for model_name in candidate_models:
        try:
            client = InferenceClient(model=model_name, token=token, timeout=12.0)
            res = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": CLINICAL_EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=850,
                temperature=0.1,
            )
            content = res.choices[0].message.content
            if content:
                parsed = _extract_json_from_text(content)
                parsed["extraction_source"] = f"llm_huggingface ({model_name})"
                return ClinicalNoteExtraction.model_validate(parsed)
        except Exception as exc:
            LOGGER.warning("Hugging Face extraction with model %s failed: %s", model_name, exc)
            continue
    return None


def extract_clinical_note_features(
    note_text: str,
    patient_profile: Optional[Dict[str, Any]] = None,
) -> ClinicalNoteExtraction:
    """
    Uses Hugging Face LLM (via HF_TOKEN / hf_token) or OpenAI (via OPENAI_API_KEY),
    falling back gracefully to the deterministic clinical ontology engine.
    """
    load_dotenv(DOTENV_PATH, override=False)
    baseline_extraction = _deterministic_clinical_extraction(note_text)

    # 1. Hugging Face LLM Provider
    hf_token = os.getenv("HF_TOKEN") or os.getenv("hf_token")
    if hf_token:
        try:
            hf_res = _extract_clinical_features_hf(
                note_text=note_text,
                token=hf_token,
                patient_profile=patient_profile,
                baseline_estimate=baseline_extraction,
            )
            if hf_res is not None:
                return hf_res
        except Exception as exc:
            LOGGER.warning("Hugging Face LLM extraction failed: %s", exc)

    # 2. OpenAI Provider Fallback
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            user_prompt = {
                "clinical_note": note_text,
                "patient_context": patient_profile or {},
                "reference_ontology_estimate": baseline_extraction.model_dump(),
            }
            response = client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
                messages=[
                    {"role": "system", "content": CLINICAL_EXTRACTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Extract and calibrate the physiological feature perturbations for this clinical note. "
                            "Return strict JSON matching ClinicalNoteExtraction.\n\n"
                            f"{json.dumps(user_prompt, ensure_ascii=False)}"
                        ),
                    },
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                timeout=8.0,
            )
            content = response.choices[0].message.content
            if content:
                parsed = _extract_json_from_text(content)
                parsed["extraction_source"] = f"llm_openai ({os.getenv('OPENAI_MODEL', DEFAULT_MODEL)})"
                return ClinicalNoteExtraction.model_validate(parsed)
        except Exception as exc:
            LOGGER.warning("OpenAI LLM extraction failed: %s", exc)

    # 3. Deterministic Clinical Ontology Engine
    return baseline_extraction

