import os
import json
import numpy as np
import pandas as pd
from openai import OpenAI
from inference import RespiTwinInferenceEngine

# Initialize OpenAI Client (Ensure OPENAI_API_KEY environment variable is set)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"))

def load_system_prompt(prompt_path="clinical_copilot_prompt.md"):
    """Loads the markdown system prompt template."""
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise FileNotFoundError(f"Could not locate prompt file at: {prompt_path}")

def generate_enhanced_copilot_report(
    patient_baseline, 
    raw_static_vec, 
    raw_dynamic_matrix, 
    prompt_path="clinical_copilot_prompt.md",
    model_name="gpt-4o"
):
    """
    Executes the full 3-Stage Stacked Ensemble Inference pipeline and generates 
    an expanded clinical evaluation report via LLM.
    """
    print("⏳ [1/3] Executing RespiTwin Stacked Ensemble Inference Engine...")
    
    # 1. Run Stacked Ensemble Pipeline
    engine = RespiTwinInferenceEngine(target_window_size=12)
    ensemble_output = engine.predict(raw_static_vec, raw_dynamic_matrix, mode="last_24h")
    
    print("📊 [2/3] Extracting Deep Biometric & Telemetry Statistical Features...")
    
    # 2. Extract detailed 24h telemetry statistics
    C, T = raw_dynamic_matrix.shape
    recent_24h = raw_dynamic_matrix[:, -24:] if T >= 24 else raw_dynamic_matrix
    
    # Compute statistical trends
    cough_seq = recent_24h[0, :]
    wheeze_seq = recent_24h[1, :]
    rr_seq = recent_24h[2, :]
    hr_seq = recent_24h[3, :]
    hrv_seq = recent_24h[4, :] if C >= 5 else np.zeros(24)

    telemetry_summary = {
        "cough_metrics": {
            "mean_cough_per_hr": round(float(np.mean(cough_seq)), 1),
            "peak_cough_per_hr": int(np.max(cough_seq)),
            "nocturnal_cough_count_last_8h": int(np.sum(cough_seq[-8:])),
            "cough_trajectory_delta": round(float(cough_seq[-1] - cough_seq[0]), 1)
        },
        "wheeze_metrics": {
            "mean_wheeze_duration_pct": round(float(np.mean(wheeze_seq)), 1),
            "peak_wheeze_duration_pct": round(float(np.max(wheeze_seq)), 1),
            "wheeze_trajectory_delta": round(float(wheeze_seq[-1] - wheeze_seq[0]), 1)
        },
        "cardiopulmonary_autonomic_metrics": {
            "mean_respiratory_rate_brpm": round(float(np.mean(rr_seq)), 1),
            "peak_respiratory_rate_brpm": round(float(np.max(rr_seq)), 1),
            "mean_heart_rate_bpm": round(float(np.mean(hr_seq)), 1),
            "mean_hrv_rmssd_ms": round(float(np.mean(hrv_seq)), 1),
            "hrv_rmssd_drop_pct": round(float(((hrv_seq[0] - hrv_seq[-1]) / (hrv_seq[0] + 1e-5)) * 100), 1)
        }
    }

    # 3. Construct Payload for LLM Copilot
    llm_payload = {
        "patient_baseline_profile": patient_baseline,
        "ensemble_risk_predictions": {
            "p24_attack_risk_pct": f"{ensemble_output['final_predictions']['p24_attack_risk'] * 100:.1f}%",
            "p48_exacerbation_risk_pct": f"{ensemble_output['final_predictions']['p48_exacerbation_risk'] * 100:.1f}%",
            "predicted_severity_grade": f"Grade {ensemble_output['final_predictions']['predicted_severity_grade']}",
            "severity_probabilities": ensemble_output['final_predictions']['severity_class_probabilities'],
            "base_model_divergence_check": {
                "tcn_stage1_scores": {
                    "24h_risk": ensemble_output["stage1_model_breakdown"]["tcn_24h"],
                    "48h_risk": ensemble_output["stage1_model_breakdown"]["tcn_48h"]
                },
                "xgb_stage1_scores": {
                    "24h_risk": ensemble_output["stage1_model_breakdown"]["xgb_24h"],
                    "48h_risk": ensemble_output["stage1_model_breakdown"]["xgb_48h"]
                }
            }
        },
        "recent_24h_telemetry_deep_summary": telemetry_summary
    }

    # 4. Load Prompt & Send Query to LLM
    print("🧠 [3/3] Querying LLM Clinical Copilot Engine...")
    system_prompt = load_system_prompt(prompt_path)
    
    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user", 
                "content": f"Analyze the following comprehensive patient telemetry payload and generate the full clinical evaluation:\n\n{json.dumps(llm_payload, indent=2)}"
            }
        ],
        temperature=0.2
    )
    
    report_text = response.choices[0].message.content
    return report_text, ensemble_output, llm_payload

# ==========================================
# VERIFICATION PIPELINE EXECUTION
# ==========================================
if __name__ == "__main__":
    # Comprehensive Patient Baseline Profile
    patient_baseline = {
        "patient_id": "PATIENT_042",
        "demographics": {"age": 48, "gender": "Female", "bmi": 27.4},
        "lung_function": {"baseline_fev1_fvc": 0.68, "baseline_fev1_pct_predicted": 72.0},
        "clinical_history": {
            "smoking_status": "Former smoker (10 pack-years)",
            "exacerbation_history_12m": 2,
            "known_allergic_triggers": ["House dust mites", "Cold air"],
            "comorbidities": ["Allergic Rhinitis", "GERD"]
        },
        "active_medication_regimen": {
            "controller": "Budesonide/Formoterol 160/4.5 mcg (2 puffs twice daily)",
            "rescue": "Albuterol HFA SABA as needed"
        }
    }

    # Generate Dummy Vectors (Matching Feature Shapes)
    dummy_static_vec = np.zeros(40)
    
    # Generate 240 hours of telemetry and inject acute exacerbation signals in recent 24h
    dummy_dynamic_matrix = np.random.randn(5, 240)
    
    # Inject acute worsening in the last 24 hours
    dummy_dynamic_matrix[0, -24:] += 22.0  # Acute cough spikes (coughs/hour)
    dummy_dynamic_matrix[1, -24:] += 42.0  # High wheeze percentage duration
    dummy_dynamic_matrix[2, -24:] += 8.0   # Tachypnea (Respiratory rate increase)
    dummy_dynamic_matrix[3, -24:] += 18.0  # Tachycardia (Pulse rate increase)
    dummy_dynamic_matrix[4, -24:] -= 20.0  # Autonomic stress (HRV RMSSD drop)

    try:
        clinical_report, model_scores, payload_sent = generate_enhanced_copilot_report(
            patient_baseline=patient_baseline,
            raw_static_vec=dummy_static_vec,
            raw_dynamic_matrix=dummy_dynamic_matrix,
            prompt_path="clinical_copilot_prompt.md"
        )

        print("\n" + "="*80)
        print("                 RESPITWIN ENHANCED LLM CLINICAL REPORT                   ")
        print("="*80 + "\n")
        print(clinical_report)
        print("\n" + "="*80)
        
    except Exception as e:
        print(f"\n❌ Error executing LLM engine: {e}")