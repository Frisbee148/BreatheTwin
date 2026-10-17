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

## Stacked TCN and Gradient-Boosting Inference

Live forecasts combine the saved TCN and XGBoost predictions with an MLP meta-learner.
Train the meta-learner on a CUDA-enabled PyTorch environment using:

```powershell
python -m aasthma.training.ensemble
```

This writes `aasthma/training/meta_ensemble_model.pt` and a JSON file containing the
held-out test metrics and model-input details. The inference service requires those
files together with the TCN and XGBoost checkpoints in `aasthma/training/`.
The trainer requires CUDA; TCN prediction and meta-learner training use the GPU.
The existing XGBoost models provide their predictions as base-model inputs.
