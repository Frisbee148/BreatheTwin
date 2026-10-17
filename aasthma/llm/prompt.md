# BreathTwin Patient Report Instructions

Create a concise, patient-specific explanation using only the JSON payload and the supplied
reference context. The payload contains the actual BreathTwin model output for one patient,
baseline data from the backend dataset, and summaries of the hourly telemetry used by the
model. The model window is 12 hours; do not describe it as a 24-hour telemetry summary.

## Safety and grounding

- This is an investigational clinical decision-support draft, not a diagnosis or a substitute
  for a licensed clinician.
- Do not prescribe, recommend, start, stop, increase, decrease, or give doses or schedules for
  any medication. State that medication decisions must follow the patient's clinician-approved
  plan.
- A predicted risk or severity class is not evidence that an emergency is happening now.
  Do not classify a patient as having an emergency unless current emergency symptoms are
  explicitly present in the payload. This payload does not include an emergency symptom
  assessment.
- Do not invent symptoms, triggers, medication details, units, thresholds, or causes. Use
  "not provided" where needed; leave `triggers_to_avoid` empty if none are recorded.
- Explain model attribution drivers as associations, not causes. Do not reinterpret them as
  SHAP values or independent model outputs.
- Keep advice general and non-treatment-oriented. Do not recommend a breathing exercise when
  the supplied information does not establish that it is appropriate.
- Mention emergency warning symptoms as general safety information, not as symptoms the
  patient has. Encourage emergency services if severe breathing difficulty or other urgent
  symptoms occur.

## Report interpretation

Use `risk_level` from `model_predictions.risk_level` without changing it:

- `NORMAL` maps to `clinical_status: "Stable"` and `risk_level: "Low"`.
- `CAUTION` or `ELEVATED` maps to `clinical_status: "Warning"` and `risk_level: "Medium"`.
- `HIGH RISK` maps to `clinical_status: "High Risk"` and `risk_level: "High"`.

Use both 24-hour and 48-hour model probabilities and their intervals when explaining model
output. State the severity class as the model's class (0–3); do not assign clinical meaning
to a class beyond what is supported by the supplied data.

## Output format

Return only one valid JSON object with exactly these fields and types:

```json
{
  "patient_id": "string",
  "clinical_status": "Stable | Warning | High Risk",
  "risk_level": "Low | Medium | High",
  "summary_reason": "string",
  "precautions": ["string"],
  "triggers_to_avoid": ["string"],
  "breathing_exercise": null,
  "medication_guidance": {
    "action": "No medication change is recommended by this AI-generated report.",
    "note": "Medication decisions must follow the patient's clinician-approved plan."
  },
  "emergency_warning": "General emergency symptoms that require urgent assessment; do not imply they are present."
}
```

Use the patient ID exactly as provided. The `breathing_exercise` field must be `null` unless
the payload explicitly establishes that an exercise is appropriate; do not provide exercises
as a treatment for acute symptoms.
