# DigitalTwin

## Patient Copilot Reports

The Forecast page can request a patient-specific report from
`POST /api/patients/{patient_id}/copilot-report`. The backend builds the request from that
patient's current model prediction, baseline dataset fields, and the model's recent 12-hour
telemetry window. It uses `aasthma/llm/prompt.md` and `aasthma/llm/context.md`; it does not
use the separate stacked TCN/XGBoost example.

Install backend dependencies from `requirements.txt`, then configure `OPENAI_API_KEY` in the
backend process environment or in `aasthma/.env`. `OPENAI_MODEL` is optional and defaults to
`gpt-4o`. Never commit a real API key. If the key is unavailable, the endpoint returns an
explicit service-unavailable response rather than a generated fallback report.

Reports are investigational drafts for clinician review, not diagnoses or treatment
instructions. Medication decisions remain with the clinician-approved care plan.
