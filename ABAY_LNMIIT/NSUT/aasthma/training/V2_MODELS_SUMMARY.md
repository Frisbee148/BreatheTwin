# RespiTwin v2 Model Training & System Invariants Summary

## 1. Executive Summary
The RespiTwin v2 digital twin framework upgrades the previous v1 architecture with:
1. **Dynamic Feature Auto-Detection**: Dynamic ingestion of extended multimodal biosensors (acoustic, computer vision facial markers, continuous photoplethysmography, and environmental air quality).
2. **GPU Acceleration**: Fully trained and benchmarked on CUDA (`NVIDIA GeForce RTX 4060 Laptop GPU`).
3. **Retraining Removal**: Permanent decommissioning of online adaptive fine-tuning (`adapt_outlier_model`), synthetic trajectory generation, and EWC penalty weight updates. All inference operates strictly in frozen forward-pass prediction mode.
4. **Heuristic Fallback Resilience**: Complete fallback mapping ensuring that sensor dropouts, missing channels, or NaNs are deterministically imputed without pipeline crashes.
5. **v1 Model Preservation**: All v1 production weights and configs remain untouched in their original directories as insurance.

---

## 2. Auto-Detected Features

### Dynamic Telemetry Channels (21 Channels Auto-Detected from `dynamic2,0/timeseries.tsv`)
| # | Channel Name | Modality | Default Fallback Value |
|---|--------------|----------|------------------------|
| 1 | `hourly_cough_count` | Acoustic | `0.0` |
| 2 | `wheeze_percent_duration` | Acoustic | `0.0` |
| 3 | `respiratory_rate_brpm` | Wearable / Sensor | `16.0` (or EHR baseline) |
| 4 | `heart_rate_bpm` | Wearable PPG | `72.0` (or EHR baseline) |
| 5 | `hrv_rmssd_ms` | Wearable PPG | `45.0` (or EHR baseline) |
| 6 | `sputum_severity` | Clinical symptom | `0.0` |
| 7 | `breathlessness_score` | Clinical symptom | `0.0` |
| 8 | `stridor_detection_index` | Microphone acoustic | `0.0` |
| 9 | `snoring_nocturnal_score` | Microphone acoustic | `0.0` |
| 10 | `vocal_hoarseness_jitter` | Microphone acoustic | `0.5` |
| 11 | `speech_rate_wpm` | Microphone acoustic | `140.0` |
| 12 | `mouth_breathing_ratio` | Video / Computer Vision | `0.1` |
| 13 | `nasal_flaring_index` | Video / Computer Vision | `0.15` |
| 14 | `brow_strain_score` | Video / Computer Vision | `0.08` |
| 15 | `head_bobbing_amplitude` | Video / Computer Vision | `0.03` |
| 16 | `video_respiratory_rate` | Video / Computer Vision | `16.0` (or EHR baseline) |
| 17 | `yawn_sigh_count` | Video / Computer Vision | `0.0` |
| 18 | `blink_rate_bpm` | Video / Computer Vision | `16.0` |
| 19 | `forehead_rppg_heart_rate` | Video rPPG | `72.0` (or EHR baseline) |
| 20 | `jaw_slack_index` | Video / Computer Vision | `0.1` |
| 21 | `gaze_instability_score` | Video / Computer Vision | `0.05` |

### Static Features (60 Dimensions Auto-Detected)
- Extracted from `static/patients.csv` and `static/history_features.csv`
- One-hot encoded across categorical attributes: gender, asthma severity stage, medication adherence, smoking status, comorbidities, and baseline spirometry (`baseline_fev1_pct`, `baseline_pef_lmin`, etc.).

---

## 3. v2 Model Architectures & Performance Metrics

### Model 1: TCN_v2 (`DigitalTwinFusionModel`)
- **Input Channels**: 21 dynamic channels, 60 static features.
- **Architecture**: Dilated 1D Temporal Convolutional Network (3 blocks, dilation rates $d=1, 2, 4$) combined with static MLP encoder.
- **Training Setup**: 10 Epochs, AdamW optimizer, Automatic Mixed Precision (AMP), GPU (CUDA).
- **Test Performance**:
  - **24h Risk Horizon ROC-AUC**: `0.6174` | F1: `0.4243`
  - **48h Risk Horizon ROC-AUC**: `0.6587`
  - **Severity Weighted F1**: `0.5831`
- **Saved Weights**: `training/model1_v2/digital_twin_model_v2.pt`
- **Saved Config**: `training/model1_v2/preprocessor_config_v2.pkl`

### Model 2: XGBoost_v2
- **Input Dimension**: 270 expanded tabular features ($60 \text{ static} + 21 \text{ channels} \times 10 \text{ rolling/lag features}$).
- **Rolling Features per Channel**: Mean, standard deviation, minimum, maximum, delta ($t - t_0$), and 5 temporal lag shifts ($-2, -1, 0, +1, +2$).
- **Training Setup**: 3 Classifiers (24h risk, 48h risk, 4-class severity) trained with `tree_method="hist"` on CUDA.
- **Test Performance**:
  - **24h Risk Horizon ROC-AUC**: `0.9569` | F1: `0.7710`
  - **48h Risk Horizon ROC-AUC**: `0.9836`
  - **Severity Weighted F1**: `0.9276`
- **Saved Weights**: `training/model2_v2/gb_digital_twin_models_v2.pkl`
- **Saved Config**: `training/model2_v2/gb_preprocessor_config_v2.pkl`

### Model 3: Meta-Learner_v2 (`RespiTwinMLPMetaLearner`)
- **Input Dimension**: 12D Meta-Feature Stacking Vector (TCN 24h, XGB 24h, TCN 48h, XGB 48h, TCN 4-class severity probs, XGB 4-class severity probs).
- **Architecture**: 2-layer MLP (Input 12 $\rightarrow$ 32 $\rightarrow$ BatchNorm $\rightarrow$ ReLU $\rightarrow$ Dropout $\rightarrow$ 16 $\rightarrow$ 3 Task Heads).
- **Training Setup**: 20 Epochs, AdamW optimizer, CUDA. Single training pass (no retraining loop).
- **Test Performance**:
  - **24h Stacking ROC-AUC**: `0.9196`
  - **48h Stacking ROC-AUC**: `0.9527`
  - **Severity Stacking F1**: `0.9382`
- **Saved Weights**: `training/meta_ensemble_model_v2.pt`
- **Saved Config**: `training/meta_ensemble_config_v2.json`

---

## 4. Retraining Decommissioning

In `inference/inference_engine.py`:
- `adapt_outlier_model()` has been disabled.
- The following online learning components have been disabled:
  - Experience replay sampling across historic cohort representations.
  - Synthetic trajectory rollout generation ($K=24$ per outlier).
  - Elastic Weight Consolidation (EWC) loss computation.
  - In-memory optimizer steps and model parameter hot-swapping.
- **Guarantee**: Inference now performs **frozen predictions only**, guaranteeing mathematical determinism and zero runtime drift.

---

## 5. Deliverables Checklist

| Deliverable | Location | Status |
|-------------|----------|--------|
| TCN_v2 Weights | `training/model1_v2/digital_twin_model_v2.pt` | Verified |
| TCN_v2 Config | `training/model1_v2/preprocessor_config_v2.pkl` | Verified |
| XGBoost_v2 Models | `training/model2_v2/gb_digital_twin_models_v2.pkl` | Verified |
| XGBoost_v2 Config | `training/model2_v2/gb_preprocessor_config_v2.pkl` | Verified |
| Meta-Learner_v2 Weights | `training/meta_ensemble_model_v2.pt` | Verified |
| Meta-Learner_v2 Config | `training/meta_ensemble_config_v2.json` | Verified |
| Retraining Decommissioned | `inference/inference_engine.py` | Verified |
| Heuristic Fallback JSON | `training/FEATURE_FALLBACK_DEFAULTS.json` | Verified |
| Fallback Integration Guide | `training/FALLBACK_INTEGRATION_GUIDE.md` | Verified |
| Summary Documentation | `training/V2_MODELS_SUMMARY.md` | Verified |
| v1 Models Preserved | `training/model1/`, `training/model2/`, `meta_ensemble_model.pt` | Verified Untouched |
