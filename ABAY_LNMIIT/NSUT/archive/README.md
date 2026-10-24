# Archive: Discarded & Deprecated Pipelines

This folder contains obsolete, prototype, or superseded pipelines and scripts moved from active execution directories.

---

### 1. `archive/inference/infernece.py`
- **Original Location:** `aasthma/inference/infernece.py`
- **Reason for Archival:**
  - Prototype inference script containing a misspelled filename (`infernece.py`).
  - Superseded by the comprehensive production implementation in [`aasthma/inference/inference_engine.py`](../aasthma/inference/inference_engine.py) (2,680+ lines), which handles full ensemble inference, mechanistic ODE integration, conformal prediction intervals, counterfactual what-if simulation, and continual EWC outlier adaptation.
  - Was not imported or referenced by any active backend endpoints or test suites.

---

### 2. `archive/dataset/dataset2.0.py`
- **Original Location:** `aasthma/dataset/dataset2.0.py`
- **Reason for Archival:**
  - Interim synthetic telemetry generator that supported only the initial 5 micro-acoustic Strados channels.
  - Superseded by [`aasthma/dataset/dataset3.0.py`](../aasthma/dataset/dataset3.0.py), which produces the multimodal audio DSP + MediaPipe facial keypoints telemetry.
