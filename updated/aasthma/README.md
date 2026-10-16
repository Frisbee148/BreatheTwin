# RespiTwin: Multi-Modal Ensemble Engine for Asthma Exacerbation Risk Prediction

RespiTwin is an end-to-end clinical decision support system that predicts **24-Hour Asthma Attack Risk**, **48-Hour Exacerbation Risk**, and **Multi-Class Severity (Grades 0–3)**.

The system leverages dynamic telemetry data derived from wearable micro-acoustic biosensors (such as Strados RESP® parameters) fused with static Electronic Health Records (EHR) and clinical history.

---

## 1. Data Generation & Preprocessing

The synthetic dataset mimics continuous digital health monitoring across patient cohorts:

### Dynamic Telemetry Channels

Captures continuous time-series streams logged at 1-hour resolution. The core channels include:

- **hourly_cough_count** — Micro-acoustic contact sensor cough spikes per hour
- **wheeze_percent_duration** — % of breathing cycles with wheezing (400–1600 Hz)
- **respiratory_rate_brpm** — Respiration rate in breaths per minute
- **heart_rate_bpm** — Pulse rate in beats per minute
- **hrv_rmssd_ms** — Heart Rate Variability (RMSSD in ms)

### Static EHR & NLP Features

Contains 40 static baseline metrics including patient age, BMI, smoking history, baseline FEV₁/FVC, prior exacerbation counts, and clinical note embeddings.

### Target Horizons & Severity Labels

- **24h Attack Risk**: Binary flag indicating an acute event in the next 24 hours
- **48h Exacerbation Risk**: Binary flag indicating event progression within 48 hours
- **Multi-Class Severity**: Grades 0 (Normal), 1 (Mild), 2 (Moderate), and 3 (Severe)

---

## 2. Model Architecture & Stacking Ensemble

RespiTwin uses a **Two-Stage Stacking Ensemble Architecture** to maximize prediction accuracy across temporal and tabular structures:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           STAGE 1: BASE MODELS                          │
└─────────────────────────────────────────────────────────────────────────┘
       │                                                     │
       ▼                                                     ▼
[ PyTorch TCN Engine ]                                [ XGBoost Model Suite ]
Multi-scale dilated 1D Conv                          Tabular rolling aggregations
+ Static Feature MLP                                 + Lag shifts (t-2 to t+2)
  • p24_tcn                                            • p24_xgb
  • p48_tcn                                            • p48_xgb
  • psev_tcn (4 classes)                               • psev_xgb (4 classes)
       │                                                     │
       └──────────────────────────┬──────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 STAGE 2: MLP META-LEARNER STACKING ENGINE               │
│                                                                         │
│ 12D Input Vector: [p24_tcn, p24_xgb, p48_tcn, p48_xgb, psev_tcn,      │
│                    psev_xgb]                                            │
│ Multi-Layer Perceptron (MLP) learns optimal confidence weighting        │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                        FINAL COMBINED PREDICTIONS
```

### Execution Order

#### tcn.py (Stage 1 Neural Stream)

Trains a multi-scale Temporal Convolutional Network with dilated 1D convolutions (d=1, 2, 4) for dynamic channels and a dense MLP for static EHR features.

**Artifacts Saved:**
- `digital_twin_model.pt`
- `preprocessor_config.pkl`

#### gradient_boosting.py (Stage 1 Decision Tree Stream)

Transforms time-series windows into rolling statistical aggregations (mean, std, min, max, delta) and extracts 5 shifted lag steps (t-2, t-1, t, t+1, t+2). Trains multi-output XGBoost models.

**Artifacts Saved:**
- `gb_digital_twin_models.pkl`
- `gb_preprocessor_config.pkl`

#### train_meta_ensemble.py (Stage 2 Meta-Learner)

Loads Stage 1 checkpoints, constructs a 12-dimensional probability vector from base predictions, and trains an MLP Meta-Learner to dynamically weigh model confidences instead of using fixed averages.

**Artifacts Saved:**
- `meta_ensemble_model.pt`

---

## 3. Inference Engine & Dual Horizon Modes

The unified inference engine (`inference.py`) reloads all 3 saved model checkpoints and supports two operational horizon modes:

### Mode 1: Recent 24-Hour Horizon (`mode="last_24h"`)

**Purpose:** Acute, real-time risk assessment using the patient's most recent 24-hour telemetry window.

- **TCN Sequence Padding**: If a stream is shorter than the TCN receptive field (12 hours), Left-Padding is automatically applied
- Left-padding preserves temporal continuity and ensures live, recent telemetry points stay aligned with the latest convolution filters

### Mode 2: Full Historical Sequence (`mode="full_history"`)

**Purpose:** Longitudinal risk trajectory evaluation using the patient's entire recorded history (e.g., 240 hours).

- The TCN global pooling layer aggregates features across the entire sequence length T
- XGBoost aggregates macro-level statistical trends across the full dataset

---

## 4. LLM Clinical Copilot Integration

The quantitative probabilities output by the stacked ensemble are passed directly to an LLM Clinical Copilot (acting as a clinical decision support assistant).

### What the LLM Predicts & Generates

**Clinical Risk Justification:** Synthesizes model probabilities with physiological telemetry trends (e.g., "Elevated 24h attack risk of 78.4% driven by a 35% increase in night-time cough spikes and dropping HRV")

**Exacerbation Trigger Analysis:** Identifies primary drivers contributing to risk elevation (e.g., acoustic wheezing duration vs. environmental AQI spikes)

**Actionable Step-Up Care Recommendations:** Recommends personalized clinical interventions aligned with GINA (Global Initiative for Asthma) guidelines, such as adjusting SABA/ICS rescue inhaler dosage or scheduling preventative clinical follow-ups

---

## Project Structure

```
aasthma/
├── dataset/              # Data generation and preprocessing
│   ├── dataset.py
│   └── data/
│       ├── dynamic/      # Time-series telemetry data
│       ├── static/       # Patient demographics and EHR
│       ├── labels/       # Risk and severity labels
│       └── text/         # Clinical notes
├── training/             # Model training pipelines
│   ├── ensemble.py       # Meta-ensemble orchestration
│   ├── model1/           # TCN base model (Stage 1)
│   └── model2/           # XGBoost base models (Stage 1)
├── inference/            # Inference engine
│   └── inference.py      # Unified inference pipeline
├── llm/                  # LLM clinical copilot
│   └── llm.py           # Clinical decision support
└── README.md             # This file
```

---

## Getting Started

1. **Generate Data**: Run the dataset preprocessing pipeline to generate synthetic telemetry and EHR data
2. **Train Stage 1 Models**: Execute TCN and XGBoost training scripts independently
3. **Train Stage 2 Meta-Learner**: Use the ensemble script to combine base model predictions and train the meta-learner
4. **Run Inference**: Use the inference engine in either 24-hour or full-history mode
5. **Generate Clinical Reports**: Pass ensemble probabilities to the LLM copilot for actionable recommendations

---

## Key Features

✓ **Multi-Modal Data Fusion**: Combines acoustic biosensor data, vital signs, and clinical history  
✓ **Dual-Horizon Predictions**: 24-hour acute risk and 48-hour exacerbation trajectory  
✓ **Stacked Ensemble Architecture**: Leverages complementary strengths of neural and tree-based models  
✓ **Clinical Explainability**: LLM-generated justifications tied to physiological telemetry  
✓ **Real-Time Capability**: Supports live streaming inference with automatic padding  
✓ **GINA-Aligned Recommendations**: Step-up care guidance for asthma management  

---

## References

- Global Initiative for Asthma (GINA): https://ginasthma.org/
- Temporal Convolutional Networks (TCN): Lea et al., "Temporal Convolutional Networks for Action Segmentation and Detection" (CVPR 2017)
- XGBoost: Chen & Guestrin, "XGBoost: A Scalable Tree Boosting System" (KDD 2016)
