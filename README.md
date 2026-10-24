# BreathTwin

**A Multimodal Mechanistic-Neural Digital Twin for 24-to-48-Hour Asthma Flare-Up Forecasting and Counterfactual Intervention Simulation**

BreathTwin is a research prototype that combines patient-history features, wearable-style physiological time series, and environmental air-quality data to estimate asthma flare-up risk over 24- and 48-hour prospective horizons. It unites an outpatient clinician dashboard, a mechanistic airway-inflammation simulator, an interactive counterfactual sandbox, clinical-note adaptation workflows, and a patient-facing companion portal.

---

### What You Can Explore

- **Monitor**: Review outpatient cohort risk triage, continuous physiological telemetry, and localized ambient air-quality conditions across 70+ Indian monitoring stations.
- **Forecast**: Inspect prospective flare-up risk trajectories over time (24h and 48h horizons), ranked SHAP feature contributions, and calibrated uncertainty bands.
- **Simulate**: Test hypothetical interventions (staying indoors, wearing an N95 respirator, indoor HEPA filtration, and controller medication adherence step-up) using the mechanistic airway model in real time (<65 ms).
- **Adapt & Explain**: Translate unstructured physician observations into physiological parameter shifts with continual model adaptation (Elastic Weight Consolidation), and generate patient-friendly Copilot reports.

> [!IMPORTANT]
> **Prototype Evaluation Status & Scientific Scope**:  
> BreathTwin is an **investigational engineering prototype** developed for decision-support research. Its current reported performance is evaluated exclusively on a **synthetic held-out cohort** generated from published clinical distributions and does not establish clinical effectiveness or real-world prospective predictive accuracy. Uncertainty intervals must be interpreted within the assumptions and evaluation conditions of the implemented split-conformal calibration method. See [Section 7.8: Model Evaluation & Reproducibility](#78-held-out-test-set-performance--reproducible-evaluation) and [Section 17: Clinical Disclaimer](#17-clinical-disclaimer).

> [!TIP]
> **Quick Start Summary**:  
> Launch all services with `./run.sh` and access the clinician dashboard at `http://localhost:3000` (FastAPI Swagger documentation at `http://localhost:8000/docs`). Full setup prerequisites, database initialization, testing commands, and troubleshooting are detailed in [Section 13: Quick Start and Execution Guide](#13-quick-start-and-execution-guide).

---

## Submission Compliance Checklist

All mandatory items required by the repository submission form are included and publicly accessible in this repository without additional permissions:

| # | Mandatory Submission Item | Status | Repository Section / Public File Link |
| :--- | :--- | :--- | :--- |
| 1 | **Team Details** | Included | [Section 1: Team Details](#1-team-details) |
| 2 | **College/Incubator Information** | Included | [Section 2: College / Incubator Information](#2-college--incubator-information) |
| 3 | **Project Title** | Included | [Section 3: Project Title](#3-project-title) |
| 4 | **Problem Statement** | Included | [Section 4: Problem Statement](#4-problem-statement) |
| 5 | **Healthcare Use Case** | Included | [Section 5: Healthcare Use Case](#5-healthcare-use-case) |
| 6 | **Technical Stack** | Included | [Section 6: Technical Stack](#6-technical-stack) |
| 7 | **AI/ML Model or Framework Details** | Included | [Section 7: AI/ML Model and Framework Details](#7-aiml-model-and-framework-details) |
| 8 | **15–20 Minute Unlisted YouTube Demo Video** | Included (Unlisted Video Link Added) | [Section 8: 15–20 Minute Demo Video](#8-1520-minute-demo-video) • [YouTube Video](https://youtu.be/S4WMAG_yx4Y) |
| 9 | **Open-Source License Details** | Included (MIT) | [Section 9: Open-Source License Details](#9-open-source-license-details) • [`LICENSE`](LICENSE) |
| 10 | **Architecture Diagram in PDF/PPT Format** | Included (PDF & SVG) | [Section 10: System and Codebase Architecture](#10-system-and-codebase-architecture) • [`docs/Architecture_Diagram.pdf`](ABAY_LNMIIT/NSUT/docs/Architecture_Diagram.pdf) |
| 11 | **Presentation in PDF/PPT Format** | Included (PDF, 15 Slides) | [Section 11: Project Presentation and Outcomes](#11-project-presentation-and-outcomes) • [`docs/Project_Presentation.pdf`](ABAY_LNMIIT/NSUT/docs/Project_Presentation.pdf) |
| 12 | **Public Accessibility Verification** | Verified | [Section 12: Public Access and Reproducibility](#12-public-access-and-reproducibility) |

---

## 1. Team Details

- **Submission Project Name**: `BreathTwin`
- **Submission Directory / Package Identifier**: `ABAY_LNMIIT/NSUT`
- **Team Composition**: Inter-College Collaborative Engineering Team (LNMIIT & NSUT)
- **Repository URL**: `https://github.com/Frisbee148/BreatheTwin`

| Role | Contributor / Profile | Institution | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Team Lead, AI & Full-Stack Engineer, Backend Architect** | Aarush Bhattacharjee / Frisbee148 (`@Frisbee148`) | The LNM Institute of Information Technology (LNMIIT) | Team Lead; System & Codebase Architecture; Full-Stack Development (Next.js 16, Three.js, WebGL/GLSL); Backend Infrastructure (FastAPI, PostgreSQL 16); Mechanistic Airway Simulator; LLM Clinical Copilot Integration; Experience Replay & Continual Adaptation Pipeline. |
| **Machine Learning Engineer** | Rakshit Gupta (`@Hobbiskar21`) | Netaji Subhas University of Technology (NSUT) | Machine Learning Engineering; Stage-1A Dilated Temporal Convolutional Network (TCN); Stage-1B XGBoost Multi-Target Suite; Stage-2 Stacking MLP Meta-Learner Architecture; Feature Preprocessing; Benchmark Validation & Conformal Calibration. |

---

## 2. College / Incubator Information

This project is an **inter-college engineering collaboration** between two Indian premier technical institutions:

| Attribute | Institution 01 (Lead Contributor) | Institution 02 (ML Contributor) |
| :--- | :--- | :--- |
| **Institution Name** | **The LNM Institute of Information Technology (LNMIIT)** | **Netaji Subhas University of Technology (NSUT)** |
| **Location** | Jaipur, Rajasthan, India | New Delhi, Delhi, India |
| **Department** | Computer Science & Engineering | Computer Science / Artificial Intelligence |
| **Incubator / Lab Affiliation** | Center for Healthcare Technologies & Clinical AI Innovation Lab | Autonomous Systems & Healthcare Informatics Lab |
| **Submission Directory** | `ABAY_LNMIIT/NSUT` | `ABAY_LNMIIT/NSUT` |

---

## 3. Project Title

**BreathTwin**

*A Multimodal Mechanistic-Neural Digital Twin for 24-to-48-Hour Asthma Flare-Up Forecasting and Counterfactual Intervention Simulation*

BreathTwin constructs a continuous, individualized physiological model of an outpatient asthma patient. The system fuses static electronic health records (EHR), 20-channel wearable sensor telemetry streams, and ambient air-quality observations to estimate acute asthma flare-up probabilities 24 to 48 hours in advance, allowing clinicians and patients to enact preventative measures before severe respiratory distress occurs.

---

## 4. Problem Statement

Asthma management in polluted urban environments faces a critical clinical blindspot between periodic outpatient clinic visits:

1. **Disproportionate Mortality Burden in India**:  
   India accounts for **more than 42% of global asthma mortality** despite representing approximately 13% of the global asthma population ([Salvi et al., *The Lancet Global Health*, 2018](https://doi.org/10.1016/S2214-109X(18)30409-1)). High levels of ambient and household particulate matter, coupled with variable controller adherence and delayed clinical presentation, drive preventable severe exacerbations.
2. **Empirical Delayed Inflammatory Response Window (24–36 Hours)**:  
   Controlled inhalation exposure and observational studies demonstrate that inhalation of ambient fine particulate matter (PM2.5) triggers a delayed bronchial mucosal inflammatory cascade ([Guarnieri & Balmes, *The Lancet*, 2014](https://doi.org/10.1016/S0140-6736(14)60617-6); [Gong et al., *Inhal Toxicol*, 2003](https://doi.org/10.1080/08958370304455); [Ghio et al., *Am J Respir Crit Care Med*, 2000](https://doi.org/10.1164/ajrccm.162.3.9911115)). Acute pulmonary oxidative stress, neutrophil/eosinophil recruitment, and secondary bronchial hyperresponsiveness peak over a characteristic **24 to 36-hour delayed window** before airway narrowing manifests as clinically perceptible dyspnea or acute forced expiratory volume drops. This delayed window provides a crucial prospective opportunity for preventative stabilization, but is invisible under reactive care models.
3. **Fragmented Clinical and Environmental Signals**:  
   Static pulmonary function baselines (spirometry FEV1, FEV1/FVC), continuous wearable biometric telemetry (nocturnal SpO2 dips, resting respiratory rate elevation, reduced heart rate variability), and ambient air-quality telemetry reside in separate operational silos.
4. **Reactive Treatment vs. Proactive Intervention**:  
   Because physicians lack visibility into sub-clinical airway inflammation between scheduled clinic visits, therapy remains reactive—often beginning only when acute bronchospasm forces emergency department presentation.

### Scope of Data Feeds

To ensure scientific clarity, BreathTwin distinguishes its data streams by origin and availability:

- **Synthetic Patient Cohort**: All 1,000 patient records (demographics, baseline spirometry, comorbidities, 20-channel wearable sensor time series, and physician event logs) are generated synthetically using physiological distributions documented in clinical literature. No protected health information (PHI) is included.
- **Environmental Telemetry**: Ambient air-quality measurements (PM2.5, PM10, AQI) can be streamed live from public monitoring stations via the Open-Meteo Air Quality API (mapped to 70+ Indian city coordinates) or replayed through deterministic benchmark scenarios.
- **Standalone vs. API-Dependent Operation**: Core ML inference, ODE simulation, What-If counterfactual analysis, deterministic clinical-note extraction, and PostgreSQL replay run 100% offline without external services. Live AQI fetching and LLM-generated patient Copilot reports utilize optional external API endpoints (`Open-Meteo`, `OpenAI`, `Hugging Face`).

---

## 5. Healthcare Use Case

BreathTwin transitions outpatient asthma care from reactive emergency triage to proactive, pre-symptomatic decision support. The platform provides dedicated, role-isolated interfaces for treating clinicians and asthma patients.

### 5.1 Primary Persona: Treating Doctor (Pulmonologist / Primary-Care Clinician)

#### Page 1: Outpatient Cohort Risk Triage (`/patients`)
* **Population-Level Risk Ranking**: Automatically ranks the outpatient panel by predicted 48-hour exacerbation probability.
* **Multi-Grade Severity Classification**: Categorizes patient status from `Grade 0 (Stable)` through `Grade 3 (Severe / Critical)`.
* **Rapid Clinical Triage Badges**: Displays visual status badges (`High Risk`, `Moderate`, `Low`) for rapid bedside prioritization.
* **Environmental Context Integration**: Overlays live ambient PM2.5 / PM10 air quality indices for each patient's home monitoring station.
* **Direct Clinical Navigation**: One-click deep link to individual digital twins, forecasts, sandbox counterfactuals, and note adaptation.

#### Page 2: Physiological Digital Twin Viewport (`/patients/[id]`)
* **State Observer Header (`MODEL: KALMAN MECHANISTIC STATE ESTIMATOR I(t) • REALISTIC ANATOMY`)**: Displays the active twin modeling mode—signifying continuous estimation of latent inflammation I(t) from noisy surface vitals mapped onto a 3D anatomical respiratory mesh.
* **Interactive 3D Pulmonary Visualization**: Renders an anatomical 3D lung model using Three.js and WebGL with responsive orbit controls.
* **Thermal Inflammation Shader Overlay**: Dynamic GLSL thermal color maps visualize localized bronchial mucosal swelling based on latent I(t).
* **Continuous Latent Airway State I(t)**: Plots continuous inflammatory trajectory derived from the Euler-Maruyama SDE solver (range [0.08, 0.98]).
* **Multi-Sensor Telemetry Comparison**: Compares rolling 12-hour wearable vitals (SpO2, resting heart rate, respiratory rate, HRV) against the patient's personalized healthy baseline.
* **Historical Longitudinal Trajectory**: Tracks 14-day trend history for spirometry baseline, daily controller compliance, and acute symptom spikes.

#### Page 3: 24-Hour & 48-Hour Conformal Risk Forecast (`/patients/[id]/forecast`)
* **Multi-Horizon Risk Probability**: Displays dual prospective risk gauges predicting exacerbation probability at 24 hours and 48 hours.
* **Conformal Uncertainty Bands**: Wraps predictions in 90% conformal prediction intervals derived from split-conformal calibration on the held-out validation cohort.
* **Interactive Hourly Timeline Scrubber**: Enables clinicians to scrub across hours t+0 to t+48 to observe projected metric evolution.
* **Ranked SHAP Feature Attribution**: Explains risk drivers using local SHAP contribution bars (e.g., nocturnal SpO2 drops, PM2.5 surge, missed controller doses).
* **Targeted Clinical Guidance**: Formulates evidence-based clinical recommendations directly aligned with dominant SHAP risk contributors.

#### Page 4: Counterfactual What-If Sandbox (`/patients/[id]/what-if`)
* **Intervention 01 — Stay Indoors Simulation**: Models the physiological impact of zero outdoor exposure hours to reduce inhaled particulate dose.
* **Intervention 02 — N95 Respirator Simulation**: Evaluates 95% particulate filtration efficacy during peak commuting or smog hours.
* **Intervention 03 — HEPA Air Filtration Simulation**: Simulates high-efficiency indoor filtration lowering indoor infiltration ratio from `0.65` to `0.30`.
* **Intervention 04 — ICS Controller Step-Up**: Simulates 100% adherence to inhaled corticosteroid therapy, computing accelerated mucosal recovery rate.
* **Real-Time Delta Comparison**: Computes before-versus-after trajectory overlays, delta risk percentage reduction, and expected FEV1 stabilization.

#### Page 5: Clinical Note Adaptation & Model Retraining (`/patients/[id]/adapt`)
* **Unstructured Doctor Free-Text Ingestion**: Accepts natural language clinical observations (e.g., concurrent typhoid fever, dengue, acute dehydration, beta-blocker introduction).
* **Clinical Feature Extraction**: Automatically parses free text into quantitative physiological perturbations (ΔT, ΔHR, ΔRR, ΔSpO2) and mechanistic ODE modifiers (δ_systemic, β_AHR, η_absorption) via LLM or deterministic regex/ontology fallback.
* **Dynamic Parameter Override**: Directly injects extracted perturbations into the patient's runtime digital twin without database schema migrations.
* **Experience Replay Buffer Commit**: Persists verified clinical outlier episodes into PostgreSQL with clinician attribution and timestamp.
* **Continual Retraining with Elastic Weight Consolidation (EWC)**: Fine-tunes the Stage-2 Meta-Learner on outlier trajectories while penalizing weight movement away from baseline Fisher information parameters.
* **Patient Acoustic Cough Sensor Feed (Graphical View)**:
  - *24-Hour Cough Frequency Histogram*: Responsive SVG timeline displaying hourly cough burst distribution with nocturnal shading (22h–06h) and color-coded burst severity (Green: 0–2, Yellow: 3–7, Red: 8+ coughs/hr).
  - *Acoustic Biomarker Radar*: Real-time tiles tracking Cough Severity Grade (0–3), Wheeze Duration % (400–1600 Hz), Sputum/Rattle Score, Inspiratory Stridor Index, Vocal Fold Micro-Jitter (mucosal edema marker), and Acoustic Respiratory Rate.
  - *Direct Model Rescoring*: `RUN TWIN INFERENCE WITH ACOUSTIC DATA` button injects acoustic coughs and wheezes into the 12-hour window and latent inflammation ODE.
* **Patient Webcam Respiratory Distress Feed (Graphical View)**:
  - *24-Hour Oral Breathing & Accessory Strain Timeline*: SVG chart tracking oral ventilation percentage and sternocleidomastoid (SCM) strain across 24 hours.
  - *Facial Biomarker Radar*: Displays Mouth Aspect Ratio (MAR), Nasal Flaring Alar Index, Head Bobbing Amplitude, Video Respiratory Rate (BRPM via nose motion bandpass), and Optical rPPG Heart Rate (BPM).
  - *Multimodal Twin Action*: `RUN MULTIMODAL TWIN INFERENCE (ACOUSTIC + CAMERA)` button fuses synchronized acoustic and visual distress streams into the full digital twin ensemble.

---

### 5.2 Secondary Persona: Asthma Patient

#### Page 6: Patient View & Self-Management Portal (`/patient-portal`)
* **Plain-Language Risk Status**: Presents current clinical risk level (`Low`, `Moderate`, `High`) in intuitive patient-friendly terminology without clinical jargon.
* **Local Ambient AQI Advisory**: Displays local monitoring station air quality readings with concrete activity recommendations.
* **Smart Acoustic Cough & Wheeze Sensor (Section 5B)**:
  - *Web Audio API Ingestion*: Patient enables microphone access (`navigator.mediaDevices.getUserMedia`) for real-time acoustic breath and cough monitoring.
  - *Live Oscilloscope Canvas*: Renders real-time transient audio waveforms and decibel volume meter in night-vision phosphor styling.
  - *Detected Cough Burst Counter & Wheeze Alert*: Tracks explosive cough bursts, assigns real-time Cough Severity Grade (0–3), and flags continuous high-pitched wheezing.
  - *Dynamic Asthma Attack Probability %*: Displays live flare-up chances updating in real time with continuous background sync to `POST /api/patients/{id}/audio-stream`.
* **Smart Webcam Facial Respiratory Distress Biosensor (Section 5C)**:
  - *Live Video Viewfinder & HUD*: User camera feed rendered with an active recording HUD and IPD (inter-pupillary distance) normalization box.
  - *Ventilation Mode Tracking*: Distinguishes 👄 Oral Breathing vs. 👃 Nasal Breathing via Mouth Aspect Ratio (MAR) with interactive threshold calibration.
  - *Accessory Muscle Strain & Flaring*: Flags nasal flaring dilation, corrugator brow strain, and sternocleidomastoid head bobbing.
  - *Contactless Optical Vitals*: Computes Video Respiratory Rate (BRPM) and Forehead rPPG Optical Pulse (BPM) via green-channel optical absorption.
  - *Continuous Stream Sync*: Periodically transmits frame snapshots to `POST /api/patients/{id}/video-stream`.
* **AI Clinical Copilot Report**: Generates and renders a comprehensive, patient-centered Copilot Report:
  - *Clinical Summary & Primary Reason*: Explains physiological state and recent environmental triggers in clear language.
  - *Actionable Non-Pharmacological Precautions*: Advises on indoor ventilation, mask usage, and activity pacing.
  - *Identified Environmental Triggers to Avoid*: Highlights active outdoor pollutants, humidity changes, and temperature drops.
  - *Personalized Guided Breathing Exercises*: Details paced diaphragmatic and pursed-lip breathing routines to alleviate respiratory strain.
  - *Emergency Warning Flags*: Highlights specific red-flag symptoms (severe chest tightness, blue lips, speaking difficulty) that necessitate immediate emergency care.
* **Daily Self-Reported Outcome (PRO) Logging**:
  - *Rescue Medication Tracking*: Records daily short-acting beta-agonist (`SABA`) rescue inhaler actuations.
  - *Controller Adherence Confirmation*: Logs daily inhaled corticosteroid doses taken.
  - *Symptom Severity Scales*: Records self-reported cough, wheeze, dyspnea, and nocturnal awakening frequency.
* **Direct Database Synchronization**: Immediately stores daily patient entries into PostgreSQL to update the clinical digital twin ahead of the next doctor review.

---

## 6. Technical Stack

| Architecture Layer | Technologies and Libraries | Purpose in BreathTwin | Mode / Dependency |
| :--- | :--- | :--- | :--- |
| **Frontend Application** | Next.js 16.4 (Turbopack), React 19.3, TypeScript 5, Tailwind CSS 4 | Doctor Cohort Triage, Forecast View, Counterfactual Sandbox, Patient Portal | Standalone Local |
| **3D & Shader Visualization** | Three.js `0.186`, WebGL / GLSL Custom Shaders, `.glb` 3D Pulmonary Mesh | Interactive 3D lung anatomical viewer and thermal inflammation reveal | Standalone Local |
| **Backend API Server** | Python 3.11+, FastAPI `0.110+`, Uvicorn, Pydantic `2.5+`, HTTPX | REST endpoints, simulation clock replay, schema validation, telemetry routing | Standalone Local |
| **Deep Learning & Boosting** | PyTorch `2.0+`, XGBoost `2.0+`, scikit-learn `1.3+`, NumPy, Pandas | Stage-1A Dilated TCN, Stage-1B XGBoost Suite, Stage-2 Stacking MLP Meta-Learner | Standalone Local |
| **Mechanistic Simulation** | Custom Euler-Maruyama SDE Solver ([`aasthma/simulation/mechanistic_simulator.py`](ABAY_LNMIIT/NSUT/aasthma/simulation/mechanistic_simulator.py)) | Continuous airway inflammation state I(t) integration and counterfactual What-If sandbox | Standalone Local |
| **Clinical Language & Copilot** | OpenAI API (`gpt-4o`) / Hugging Face (`Llama-3.1-8B` / `Qwen2.5`) + Deterministic Fallback Engine | Schema-validated clinical reports, unstructured clinical note perturbation extraction | External API (with Offline Fallback) |
| **Continual Adaptation & EWC** | Elastic Weight Consolidation (EWC), Experience Replay Buffer, PyTorch | Fine-tuning Stage-2 Meta-Learner on clinician-verified outlier episodes | Standalone Local |
| **Acoustic Audio & DSP** | Google YamNet (AudioSet Class 47 Cough, Class 50 Wheeze), Librosa, SoundFile, SciPy STFT | Live microphone cough detection, wheeze duration %, vocal jitter/shimmer, stridor | Standalone Local |
| **Computer Vision & Video** | MediaPipe FaceMesh (468 3D landmarks), OpenCV, optical rPPG green-channel FFT | Webcam facial respiratory distress, mouth breathing ratio (MAR), nasal flaring, optical pulse | Standalone Local |
| **Database & Persistence** | PostgreSQL 16 (`postgres:16-alpine`), SQLAlchemy 2.0, Psycopg 3 | Stores patients, telemetry, clinical events, daily logs, and RBAC accounts | Standalone Local (Containerized) |
| **Environmental Telemetry** | CPCB Station Coordinates (70+ Indian cities), Open-Meteo Air Quality API | Live ambient PM2.5, PM10, and AQI telemetry, plus replayed historical episodes | External API / Local Scenario Cache |
| **Packaging & Testing** | Docker Compose, Pytest `8.0+`, Bash service orchestration (`run.sh`, `stop.sh`) | Containerized database, environment validation, and automated P0 verification tests | Standalone Local |

---

## 7. AI/ML Model and Framework Details

BreathTwin combines a **Two-Stage Multi-Model Ensemble** (Stage 1A TCN + Stage 1B XGBoost fused via a Stage 2 Stacking MLP Meta-Learner), a **Mechanistic Differential Equation Airway Simulator**, and two distinct **Language Pathways** for clinical note adaptation and patient reporting.

```text
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    MULTIMODAL INPUT DATA                    │
                               │  • Static EHR (60 features)  • Dynamic Telemetry (20 chan) │
                               │  • Ambient Particulate Matter (PM2.5, PM10, AQI)            │
                               └──────────────────────────────┬──────────────────────────────┘
                                                              │
                                     ┌────────────────────────┴────────────────────────┐
                                     │                                                 │
                                     ▼                                                 ▼
                      ┌─────────────────────────────┐                   ┌─────────────────────────────┐
                      │    STAGE 1A: DILATED TCN    │                   │      STAGE 1B: XGBOOST      │
                      │  Conv1D (d=1,2,4) + MLP     │                   │  Lag Shifts + Rolling Stats │
                      │  Outputs: 24h, 48h, Sev(4)  │                   │  Outputs: 24h, 48h, Sev(4)  │
                      └──────────────┬──────────────┘                   └──────────────┬──────────────┘
                                     │                                                 │
                                     └────────────────────────┬────────────────────────┘
                                                              │ 12-Dimensional Base Probability Vector
                                                              ▼
                                     ┌─────────────────────────────────────────────────┐
                                     │         STAGE 2: STACKING MLP META-LEARNER      │
                                     │  Linear(12,32) -> BN -> ReLU -> Linear(32,16)   │
                                     │  Outputs: Calibrated P(24h), P(48h), Grade(0-3) │
                                     └──────────────┬──────────────────────────┬───────┘
                                                    │                          │
                 ┌──────────────────────────────────┘                          └──────────────────────────────────┐
                 │ Neural 48h Probability                                                      Calibrated Risk & Drivers
                 ▼                                                                                                ▼
┌──────────────────────────────────────────────────┐                                           ┌────────────────────────────────────┐
│      MECHANISTIC AIRWAY SDE SIMULATOR            │                                           │  PATH B: PATIENT CLINICAL COPILOT  │
│  dI/dt = -k·I + a·Dose + b·Trig - c·Adh + σ·ξ(t) │                                           │  • Structured Pydantic Reports     │
│  • Latent mucosal state I(t) in [0.08, 0.98]     │                                           │  • Plain-language precautions      │
│  • Blended Twin View: 0.55·I_ODE + 0.45·P(48h)   │                                           │  • Guided breathing & red flags    │
│  • Independent Counterfactual Sandbox Branch     │                                           └────────────────────────────────────┘
└────────────────────────┬─────────────────────────┘
                         ▲
                         │ Physiological Deltas & Latent Modifiers (δ_sys, β_AHR, η_absorb)
┌────────────────────────┴─────────────────────────┐
│     PATH A: CLINICAL NOTE ADAPTATION             │
│  Doctor Free Text -> LLM / Ontology Extractor    │
│  -> Dynamic Twin Override -> PostgreSQL Replay   │
│  -> EWC Continual Retraining of Stage-2 Meta     │
└──────────────────────────────────────────────────┘
```

---

### 7.1 Mechanistic Airway Inflammation State Estimator (Latent SDE)

Implemented in [`aasthma/simulation/mechanistic_simulator.py`](ABAY_LNMIIT/NSUT/aasthma/simulation/mechanistic_simulator.py). Every virtual patient maintains a continuous latent airway inflammation state I(t) ∈ [0.08, 0.98] governed by the stochastic differential equation:

$$
\frac{dI}{dt} = -k \cdot I(t) + a \cdot \beta_{\text{AHR}} \cdot \text{Dose}_{\text{PM}}(t) + b \cdot \text{Trigger}(t) + \delta_{\text{systemic}} - c \cdot \eta_{\text{absorption}} \cdot \text{Controller}(t) + \sigma \cdot \xi(t)
$$

where ξ(t) ~ N(0, 1) represents standard Gaussian white noise. The equation is solved numerically using the **Euler-Maruyama discretization method** with a time step of Δt = 1.0 hour, and the updated state is bounded to [0.08, 0.98] via clipping.

#### Biological Parameter Registry & Literature Rationales

All parameter values are grounded in published clinical and pharmacological literature, registered in [`aasthma/simulation/clinical_data.py`](ABAY_LNMIIT/NSUT/aasthma/simulation/clinical_data.py), and auditable via the `/assumptions` endpoint:

| Parameter | Symbol | Calibrated Value | Units | Physiological Role & Rationale | Literature Citation & DOI |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Inflammation Recovery Decay Rate** | k | 0.08 | hr⁻¹ | Spontaneous clearance and resolution of bronchial epithelial inflammation in the absence of active insults (half-life ≈ 8.6 hours). | Barnes, P. J. (2010), *J Allergy Clin Immunol*, [10.1016/j.jaci.2010.02.034](https://doi.org/10.1016/j.jaci.2010.02.034) |
| **Particulate Deposition Factor** | a | 0.0009 | (µg/m³)⁻¹·hr⁻¹ | Rate of latent mucosal oxidative stress and inflammatory induction per unit of inhaled ambient PM2.5, scaled by individual hyperresponsiveness (β_AHR). | Guarnieri, M. & Balmes, J. R. (2014), *The Lancet*, [10.1016/S0140-6736(14)60617-6](https://doi.org/10.1016/S0140-6736(14)60617-6) |
| **Meteorological & Symptom Sensitivity** | b | 0.020 | hr⁻¹ | Airway sensitivity responding to rapid diurnal humidity drops, cold thermal shocks, and acute symptom triggers (cough, wheeze, rescue inhaler puffs). | Graudenz, G. S., et al. (2006), *Chest*, [10.1378/chest.129.3.645](https://doi.org/10.1378/chest.129.3.645) |
| **Controller Inhaled Steroid Efficacy** | c | 0.100 | hr⁻¹ | Suppression rate of eosinophilic airway cascade via inhaled corticosteroid (ICS) receptor binding, scaled by medication adherence and absorption efficiency (η_absorption). | Global Initiative for Asthma (GINA, 2023), *Eur Respir J*, [10.1183/13993003.01053-2023](https://doi.org/10.1183/13993003.01053-2023) |
| **Stochastic Biological Variance** | σ | 0.015 | dimensionless | Gaussian white noise term representing unmeasured micro-environmental fluctuations, emotional stress, and physiological volatility. | Frey, U., et al. (2005), *Am J Respir Crit Care Med*, [10.1164/rccm.200404-517OC](https://doi.org/10.1164/rccm.200404-517OC) |
| **Indoor Particulate Penetration Ratio** | α_indoor | 0.65 (unfiltered) / 0.30 (HEPA) | ratio | Fraction of ambient outdoor PM2.5 that infiltrates standard urban residential and commercial building envelopes. | Pant, P., et al. (2017), *Environ Pollut*, [10.1016/j.envpol.2016.03.064](https://doi.org/10.1016/j.envpol.2016.03.064) |
| **Respirator Filtration Efficiency** | η_N95 | 0.05 (95% filtration) | ratio | Penetration fraction applied to outdoor PM2.5 exposure when an N95-certified respirator is worn during transit. | NIOSH / CDC (2020), DHHS Publication No. 2020-120, [10.26616/NIOSHPUB2020120](https://doi.org/10.26616/NIOSHPUB2020120) |

> [!NOTE]
> **State Observer Analogy ("Kalman Mechanistic State Estimator")**:  
> In the clinician interface, this component is labeled *Kalman Mechanistic State Estimator*. In system theory, a Kalman filter acts as a state observer that infers an unmeasurable internal state by filtering noisy, indirect surface observations against a dynamical model. Here, internal mucosal inflammation cannot be directly measured by consumer wearables. Operating as a state observer, the engine infers latent I(t) from noisy vitals (SpO2, heart rate, respiratory rate, nocturnal dips) and particulate exposure, mapping the estimated state onto a 3D anatomical lung mesh (`realistic_human_lungs.glb`) for clinical inspection. It is a functional physiological state observer rather than a classic unconstrained linear-Gaussian matrix filter.

---

### 7.2 Stage 1A: Multimodal Dilated Temporal Convolutional Network (`DigitalTwinFusionModel`)

Implemented in [`aasthma/models/digital_twin_model.py`](ABAY_LNMIIT/NSUT/aasthma/models/digital_twin_model.py) and trained in [`aasthma/training/model1/tcn.py`](ABAY_LNMIIT/NSUT/aasthma/training/model1/tcn.py) (checkpoint: [`aasthma/training/model1/digital_twin_model.pt`](ABAY_LNMIIT/NSUT/aasthma/training/model1/digital_twin_model.pt)):

1. **`StaticMLPEncoder`**: Encodes 60 normalized static EHR and clinical history features (`Linear(60, 128) -> BatchNorm1d -> ReLU -> Dropout(0.2) -> Linear(128, 64) -> BatchNorm1d -> ReLU`).
2. **`Conv1DDynamicEncoder`**: Encodes the 20-channel, 12-hour sliding telemetry window through three hierarchical `TCNBlock` layers with exponentially increasing dilation factors (`dilation = 1, 2, 4`, `kernel_size = 3`, channels `20 -> 32 -> 64 -> 128`), followed by `AdaptiveAvgPool1d(1)` and linear projection.
3. **Multi-Task Fusion Head**: Concatenates the `64D` static embedding and `128D` temporal embedding (`192D -> 64D`) to output three predictions:
   - `logit_24h`: 24-hour flare-up probability.
   - `logit_48h`: 48-hour severe exacerbation probability.
   - `logits_sev`: 4-class exacerbation severity logits (`Grade 0: None`, `Grade 1: Mild`, `Grade 2: Moderate`, `Grade 3: Severe`).

---

### 7.3 Stage 1B: Gradient-Boosted Decision Tree Suite (`XGBoost`)

Implemented in [`aasthma/training/model2/gradient_boosting.py`](ABAY_LNMIIT/NSUT/aasthma/training/model2/gradient_boosting.py) (checkpoint: [`aasthma/training/model2/gb_digital_twin_models.pkl`](ABAY_LNMIIT/NSUT/aasthma/training/model2/gb_digital_twin_models.pkl)):

- Computes rolling statistical aggregations (`mean`, `std`, `min`, `max`, `delta`) and temporal lag shifts (`t-2`, `t-1`, `t`, `t+1`, `t+2`) across all 20 dynamic channels over the 12-hour window, fused with the 60 static EHR features.
- Outputs independent base probabilities for 24-hour risk, 48-hour risk, and 4-class severity.

---

### 7.4 Stage 2: Stacked MLP Meta-Learner (`RespiTwinMLPMetaLearner`)

Implemented in [`aasthma/training/ensemble.py`](ABAY_LNMIIT/NSUT/aasthma/training/ensemble.py) (checkpoint: [`aasthma/training/meta_ensemble_model.pt`](ABAY_LNMIIT/NSUT/aasthma/training/meta_ensemble_model.pt), configuration: [`aasthma/training/meta_ensemble_config.json`](ABAY_LNMIIT/NSUT/aasthma/training/meta_ensemble_config.json)):

- Ingests the 12-dimensional base probability vector:
  `[tcn_risk_24h, xgboost_risk_24h, tcn_risk_48h, xgboost_risk_48h, tcn_severity_0..3, xgboost_severity_0..3]`
- Passes the vector through `Linear(12, 32) -> BatchNorm1d -> ReLU -> Dropout(0.2) -> Linear(32, 16) -> ReLU` to produce final calibrated multi-horizon probabilities and severity grades in `< 5 ms`.

---

### 7.5 Integration & Signal Flow: How the ODE Simulator and Neural Meta-Learner Interlink

The relationship between the neural ensemble and the mechanistic ODE simulator operates across two distinct pathways:

1. **Real-Time State Blending for Visualization**: During runtime prediction ([`aasthma/inference/inference_engine.py#L841-L849`](ABAY_LNMIIT/NSUT/aasthma/inference/inference_engine.py#L841-L849)), the ODE numerically integrates over the patient's observed 12-hour telemetry and particulate exposure window to calculate latent biological mucosal inflammation I_ODE. The engine blends this mechanistic state with the neural ensemble's 48-hour risk probability P_48h to produce the final estimated airway inflammation score:

$$
\text{Estimated } I(t) = \text{clip}\left(0.55 \cdot I_{\text{ODE}} + 0.45 \cdot \left(0.92 \cdot P_{48\text{h}} + 0.06\right),\, 0.10,\, 0.95\right)
$$

This combined metric drives the real-time GLSL thermal shader on the 3D pulmonary mesh.

2. **Counterfactual What-If Sandbox**:  
   The ODE simulator acts as an independent physics-based branch. When a clinician adjusts intervention sliders (`Stay Indoors`, `Wear N95 Mask`, `HEPA Purifier`, `ICS Adherence Step-Up`), the simulator recalculates the projected inflammation curve I(t) over prospective hours by modifying physical differential equation parameters (Dose_PM, α_indoor, η_N95, Adherence) without altering historical wearable records.

---

### 7.6 Path A: Clinical Language & Note Adaptation Pipeline

Implemented in [`aasthma/llm/clinical_extractor.py`](ABAY_LNMIIT/NSUT/aasthma/llm/clinical_extractor.py) and [`aasthma/inference/inference_engine.py`](ABAY_LNMIIT/NSUT/aasthma/inference/inference_engine.py):

```text
Unstructured Doctor Note ("Patient presented with Typhoid fever, 102.5F, severe vomiting, SpO2 91%")
                                      │
                                      ▼
           [Stage-3 Clinical LLM Extraction / Deterministic Ontology Engine]
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
  [Vital Sign Perturbations]                         [Mechanistic ODE Modifiers]
  • Δ Skin Temp: +2.5 °C                             • Systemic Load (δ_sys): 0.65
  • Δ Resting HR: +25 bpm                            • Airway Hyperresponsiveness (β_AHR): 1.60
  • Δ Respiratory Rate: +5 br/min                    • Absorption Efficiency (η_absorb): 0.70
  • Δ SpO2: -3.2%                                    • Dehydration: mild_dehydration
            │                                                   │
            └─────────────────────────┬─────────────────────────┘
                                      ▼
             [Dynamic Feature Override & Mechanistic ODE Integration]
                                      │
                                      ▼
             [Doctor Commit to Experience Replay Buffer (PostgreSQL)]
                                      │
                                      ▼
             [Continual Meta-Learner Retraining with EWC Regularization]
               L_total = L_outlier + (λ_EWC / 2) · Σ F_i · (θ_i - θ_i,base)²
```


#### Step-by-Step Clinical Note Ingestion and Adaptation Flow

1. **Unstructured Text Extraction**: The clinician submits free-text observations (e.g., systemic febrile infections like typhoid, dengue, malaria, or medication changes such as beta-blocker introduction).
2. **Physiological Mapping**: An LLM (or the deterministic regex/ontology fallback engine) extracts structured perturbations:
   - Dynamic Wearable Deltas (ΔT, ΔHR, ΔRR, ΔSpO2, ΔHRV).
   - Mechanistic ODE Modifiers: Injects systemic cytokine load (δ_systemic), scales airway hyperresponsiveness (β_AHR), and adjusts controller absorption efficiency (η_absorption).
3. **Doctor Verification & Buffer Commit**: Verified clinical outlier episodes are committed to the PostgreSQL **Experience Replay Buffer** via `POST /api/patients/{id}/clinical-note/commit`.
4. **Continual Retraining with Elastic Weight Consolidation (EWC)**: The adaptation engine fine-tunes `RespiTwinMLPMetaLearner` on outlier trajectories while preserving previously learned baseline asthma dynamics ([Kirkpatrick et al., *PNAS*, 2017](https://doi.org/10.1073/pnas.1611835114)). The loss function regularizes parameter drift:

$$
\mathcal{L}_{\text{total}}(\theta) = \mathcal{L}_{\text{outlier}}(\theta) + \frac{\lambda_{\text{EWC}}}{2} \sum_{i} F_i \left(\theta_i - \theta_{i, \text{base}}\right)^2
$$

where `L_outlier(θ)` is the task loss on the outlier episode, `λ_EWC` is the consolidation importance hyperparameter, `θ_{i,base}` denotes the anchor weights of the trained baseline model, and `F_i` represents the diagonal Fisher Information Matrix elements measuring parameter sensitivity on baseline asthma cohorts.

---

### 7.7 Path B: Patient Clinical Copilot Report Generation

Implemented in [`aasthma/llm/llm.py`](ABAY_LNMIIT/NSUT/aasthma/llm/llm.py):

- **Structured Patient-Facing Synthesis**: Ingests calibrated risk probabilities, ambient AQI readings, and top SHAP feature contributors to generate an empathetic, actionable report strictly adhering to the Pydantic `CopilotReport` schema.
- **Provider Support**: Supports `OpenAI GPT-4o` and `Hugging Face InferenceClient` (`meta-llama/Llama-3.1-8B-Instruct`, `Qwen/Qwen2.5-72B-Instruct`), with automated offline fallback to pre-structured templates if API keys are not supplied.
- **Non-Prescriptive Safety Guardrails**: System prompts strictly forbid autonomous medication modifications or dosage prescriptions; all advice emphasizes indoor precautions, activity pacing, guided breathing exercises, and emergency red-flag escalation criteria.

---

### 7.8 Held-Out Test Set Performance & Reproducible Evaluation

The quantitative evaluation was conducted on a patient-split cohort generated from published clinical distributions. All evaluation scripts, data loaders, and model checkpoints are included in the repository.

#### Evaluation Protocol and Dataset Details

- **Cohort Generation**: 1,000 synthetic patient records (generated via [`aasthma/dataset/dataset.py`](ABAY_LNMIIT/NSUT/aasthma/dataset/dataset.py)) spanning 240 continuous monitoring hours per patient, yielding 229 sliding 12-hour windows per patient.
- **Patient Split (Zero Data Leakage)**: Split strictly at the patient level using random seed `42`:
  - **Training Cohort**: 800 patients (80%, 183,200 telemetry windows).
  - **Validation Cohort**: 100 patients (10%, 22,900 telemetry windows).
  - **Held-Out Test Cohort**: 100 patients (10%, 22,900 telemetry windows).  
  All static and dynamic normalization parameters (`preprocessor_config.pkl` and `gb_preprocessor_config.pkl`) were fitted exclusively on the 800 training patients.
- **Target Label Definitions**:
  - **24-Hour Flare-Up (`y_24`)**: `y_24 = 1.0` if an exacerbation event begins within the prospective window `(t, t+24h]` or is active at hour `t`; `0.0` otherwise.
  - **48-Hour Severe Exacerbation (`y_48`)**: `y_48 = 1.0` if an exacerbation begins within `(t, t+48h]` or is active at hour `t`; `0.0` otherwise.
  - **Severity Tier (`y_sev`)**: Maximum severity score among active/upcoming events within the horizon (`Grade 0: None`, `Grade 1: Mild`, `Grade 2: Moderate`, `Grade 3: Severe`).
  - **Class Prevalence in Test Set**: Approximately 18.4% positive 24-hour windows.
- **Warning Lead Time Definition**: The temporal difference between the first continuous prospective warning (`P(risk) >= 0.50`) and the recorded onset timestamp of the severe exacerbation event, evaluated across true-positive flare-up trajectories in the test split (42.4 ± 4.1 hours).
- **Inference Latency Protocol**: Measured single-instance inference (batch size = 1) across 100 consecutive forward passes following 5 warm-up cycles on an 8-core x86-64 CPU and NVIDIA RTX GPU. End-to-end FastAPI HTTP round-trip latency averaged <65 ms.

#### Benchmark Results on Held-Out Test Cohort

| Model / Architecture | 24h ROC-AUC | 48h ROC-AUC | 24h Precision (@0.5) | 24h Recall (@0.5) | Severity Weighted F1 | Mean Warning Lead Time | Single Inference Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BreathTwin Stacked Ensemble (TCN + XGBoost + MLP + ODE)** | **0.9399** | **0.9428** | **0.8560** | **0.7281** | **0.8435** | **42.4 ± 4.1 h** | **&lt; 65 ms** |
| Standard Recurrent Network (LSTM Baseline) | 0.7850 | 0.7790 | 0.6840 | 0.6520 | 0.7010 | 22.1 ± 5.8 h | 110 ms |
| Tabular Gradient Boosted Trees (XGBoost Baseline) | 0.7410 | 0.7320 | 0.6310 | 0.5980 | 0.6640 | 18.6 ± 6.2 h | &lt; 15 ms |
| Real-World Clinical Cohort Efficacy | *Not measured* | *Not measured* | *Not measured* | *Not measured* | *Not measured* | *Not measured* | *Not measured* |

> [!NOTE]
> As highlighted above, metrics on real-world clinical cohorts are **not measured** and cannot be claimed from synthetic held-out benchmarks. Real-world validation requires prospective clinical trials approved by an Institutional Review Board (IRB).

---

## 8. 15–20 Minute Demo Video

> [!TIP]
> **Unlisted YouTube Demonstration Video**:  
> **[▶ Watch the BreathTwin 20-Minute Clinical & Architectural Demo on YouTube](https://youtu.be/S4WMAG_yx4Y)**  
> **Direct Video URL**: `https://youtu.be/S4WMAG_yx4Y`  
> *(Unlisted submission video; publicly accessible without additional permissions; duration: ~20 minutes)*

### Video Walkthrough Chapters (20 Minutes)
- **`00:00 – 03:30`**: Problem Statement, Indian Urban Pollution Context, and the 24–36h Delayed Inflammatory Window.
- **`03:30 – 08:15`**: Three-Stream Data Ingestion (60 Static EHR Features, 20 Wearable Channels, CPCB Live AQI) and PostgreSQL Schema.
- **`08:15 – 13:00`**: Doctor Dashboard Walkthrough — Cohort Triage, 3D/Thermal Pulmonary Twin Viewport, and 24h/48h Conformal Risk Forecast.
- **`13:00 – 17:30`**: Counterfactual What-If Sandbox (Stay Indoors, N95 Mask, HEPA Filter, ICS Step-Up), Dynamic LLM Note Adaptation, and Experience Replay Retraining.
- **`17:30 – 20:00`**: Stacked Dilated-TCN + XGBoost + MLP Architecture, Ablation Benchmarks, and Patient Portal with AI Copilot Report.

---

## 9. Open-Source License Details

This project is released under the **MIT Open-Source License**. See the [`LICENSE`](LICENSE) file in the repository root for the full license text.

- **Source Code License**: MIT License (`Copyright (c) 2026 Team DigiTwin`).
- **Data Integrity & Synthetic Status**: All patient health records, spirometry baselines, and wearable time series in this repository are **100% synthetic**, generated from statistical distributions published in respiratory health literature. Zero real patient identifiable information (PII/PHI) is stored or processed, adhering to privacy-by-design engineering principles.
- **Environmental Data**: Ambient air-quality and meteorological feeds utilize open monitoring station coordinates and the Open-Meteo public API.

---

## 10. System and Codebase Architecture

### 10.1 Architecture Diagram (PDF, SVG, and PlantUML)

- **Downloadable Architecture Diagram (PDF Format)**: [`docs/Architecture_Diagram.pdf`](ABAY_LNMIIT/NSUT/docs/Architecture_Diagram.pdf)
- **High-Resolution Architecture Diagram (PNG Format)**: [`docs/architecture.png`](ABAY_LNMIIT/NSUT/docs/architecture.png) • [`frontend/public/architecture-diagram-v2.png`](ABAY_LNMIIT/NSUT/frontend/public/architecture-diagram-v2.png)
- **Vector Architecture Diagram (SVG Format)**: [`docs/Architecture_Diagram.svg`](ABAY_LNMIIT/NSUT/docs/Architecture_Diagram.svg) • [`frontend/public/architecture-diagram-v2.svg`](ABAY_LNMIIT/NSUT/frontend/public/architecture-diagram-v2.svg)
- **PlantUML Diagram Source**: [`docs/architecture.puml`](ABAY_LNMIIT/NSUT/docs/architecture.puml)
- **Preserved Archive / Original Diagram Backup**: [`docs/backup/`](ABAY_LNMIIT/NSUT/docs/backup/)

The high-resolution architecture diagram (`docs/architecture.png` and `docs/Architecture_Diagram.pdf`) provides modality-specific color coding for clinical and machine learning pipelines:
- **Green (`#059669`)**: Multimodal Sensor Feeds (Static 60D Baseline, 20ch Telemetry Series) and UI Telemetry Streams
- **Blue (`#2563EB`)**: Base Predictor Probabilities & Calibrated Conformal Risk Forecast
- **Orange (`#D97706`)**: Ambient Particulate Dose, Latent Airway Inflammation State I(t), and Counterfactual Sandbox Coupling
- **Purple (`#7C3AED`)**: LLM Clinical Feature Extraction, EWC Continual Retraining Feed, and Synthesized Copilot Reports
- **Dark Blue (`#1D4ED8`)**: Relational PostgreSQL Stream Persistence

![BreathTwin System and Codebase Architecture Diagram](ABAY_LNMIIT/NSUT/docs/architecture.png)

The compact Mermaid diagram below illustrates end-to-end signal routing across the three primary system tiers:

```mermaid
flowchart LR
    subgraph Streams["01. Multimodal Input Streams & Storage"]
        EHR["Stream 01: Static EHR (60 Features)<br/>Demographics, FEV1%, Controller, History"]
        WEAR["Stream 02: Wearable Telemetry (20 Channels)<br/>SpO2, HR, HRV, RR, Sleep, SABA, Symptoms"]
        AQI["Stream 03: Environment (CPCB / Open-Meteo)<br/>PM2.5, PM10, AQI across 70+ Indian Stations"]
        PG[("PostgreSQL 16 + SQLAlchemy<br/>patients, timeseries_telemetry,<br/>patient_daily_logs, user_accounts")]
    end

    subgraph Core["02. Hybrid Digital Twin Core (ABAY_LNMIIT/NSUT/aasthma/)"]
        ODE["Mechanistic Airway SDE Simulator<br/>dI/dt = -kI + a·Dose_PM + b·Trigger - c·Controller"]
        TCN["Stage 1A: Dilated TCN Fusion<br/>StaticMLPEncoder + Conv1DDynamicEncoder (d=1,2,4)"]
        XGB["Stage 1B: XGBoost Multi-Target Suite<br/>Rolling Window Stats + Lag Shifts"]
        META["Stage 2: RespiTwinMLPMetaLearner<br/>12D Base Probs → Calibrated 24h/48h Risk + Severity"]
        LLM["Stage 3: Clinical Copilot & Note Extractor<br/>Pydantic Schema + Non-Prescriptive Guardrails"]
    end

    subgraph UI["03. FastAPI Gateway & Next.js 16 Interfaces"]
        API["FastAPI Backend (:8000)<br/>REST Endpoints + Simulation Clock"]
        DOC["Doctor Dashboard (:3000)<br/>Cohort Triage, 3D/Thermal Twin, What-If Sandbox"]
        PAT["Patient Portal (:3000/patient-portal)<br/>Personal Forecast, Daily Logs, Copilot Chat"]
    end

    EHR & WEAR & AQI --> PG
    EHR & WEAR & AQI --> TCN & XGB
    WEAR & AQI --> ODE
    TCN & XGB --> META
    ODE <--> META
    META --> LLM
    META & ODE & LLM --> API
    API --> DOC & PAT
```

### 10.2 Codebase Architecture

The repository separates the Python clinical inference backend (`aasthma/`) from the Next.js 16 visualization frontend (`frontend/`):

```text
ABAY_LNMIIT/NSUT/                     # Submission Package Identifier
├── aasthma/                          # Python Backend, Mechanistic SDE, and 3-Stage AI Pipeline
│   ├── server.py                     # FastAPI gateway (:8000), RBAC auth, clock, and REST routes
│   ├── models/digital_twin_model.py  # Stage-1A PyTorch Dilated TCN + Static MLP fusion network
│   ├── training/
│   │   ├── model1/                   # Stage-1A Dilated TCN trainer and digital_twin_model.pt
│   │   ├── model2/                   # Stage-1B XGBoost trainer and gb_digital_twin_models.pkl
│   │   └── ensemble.py               # Stage-2 RespiTwinMLPMetaLearner and meta_ensemble_model.pt
│   ├── inference/
│   │   ├── inference_engine.py       # Multimodal pipeline, EWC model adaptation, conformal bounds
│   │   ├── mic_features_inference.py # Real-time acoustic YamNet + STFT DSP audio pipeline
│   │   └── face_features_inference.py# Real-time MediaPipe FaceMesh + OpenCV optical rPPG facial distress pipeline
│   ├── simulation/
│   │   ├── mechanistic_simulator.py  # Latent airway inflammation SDE solver and What-If engine
│   │   ├── clock.py                  # Replay clock synchronizing 240-hour telemetry streams
│   │   └── clinical_data.py          # Literature-cited SDE coefficients and ablation benchmarks
│   ├── llm/
│   │   ├── llm.py                    # Stage-3 Pydantic-validated Clinical Copilot report generator
│   │   └── clinical_extractor.py     # Free-text clinical note parser for ODE & vital perturbations
│   ├── database/                     # SQLAlchemy 2.0 ORM models (Acoustic & Visual tables), PostgreSQL repository
│   ├── dataset/                      # Telemetry parquet series, synthetic patient distributions
│   └── tests/                        # Comprehensive pytest test suite (test_p0.py: 21 passing tests)
├── archive/                          # Archived superseded prototypes and obsolete scripts
├── frontend/                         # Next.js 16 (Turbopack) + React 19 + Three.js Web Application
│   ├── app/                          # App Router: Home, /login, /patients, /[id]/forecast, /what-if, /adapt, /patient-portal
│   ├── components/                   # 3D PulmonaryTwin3D, InteractiveThermalReveal, PatientAdaptationView, TelemetryChart
│   ├── lib/                          # Typed API client (api.ts: audio & video streaming), auth context, fallback state
│   └── public/                       # 3D GLTF models, architecture diagrams, presentation PDF mirrors
├── docs/                             # Public PDF/SVG Architecture Diagram and Project Presentation
│   ├── Architecture_Diagram.pdf      # Vector System Architecture Diagram (PDF)
│   ├── Architecture_Diagram.svg      # Vector System Architecture Diagram (SVG)
│   ├── architecture.png              # High-Resolution System Architecture Diagram (PNG)
│   ├── architecture.puml             # PlantUML Diagram Source
│   ├── backup/                       # Preserved Archive of Original Diagram Artifacts
│   ├── BreathTwin_Project_Presentation.pdf # Presentation slide deck (Mirror PDF)
│   └── Project_Presentation.pdf      # Complete 15-slide project presentation deck (Universal PDF)
├── docker-compose.yml                # PostgreSQL 16 container orchestration (breathtwin-postgres)
├── requirements.txt                  # Python backend and ML dependencies
├── run.sh / stop.sh                  # One-command full-stack startup and teardown scripts
├── .env.example                      # Environment variables template (API keys, DB config)
├── LICENSE                           # MIT Open-Source License
├── README.md                         # Complete project documentation and submission specification
└── SECURITY.md                       # Security reporting, secret boundaries, and safeguards
```

---

## 11. Project Presentation and Outcomes

The complete project presentation slide deck is provided in universal PDF format directly inside the repository. The presentation covers the project lifecycle across **15 widescreen slides**—including clinical motivation, 3-stream data ingestion, mechanistic latent SDE, 3-stage predictive ensemble, adaptive clinical note adaptation, clinician and patient portal experiences, empirical benchmark validation, and safety guardrails.

- **Downloadable Project Presentation (PDF Format)**: [`docs/Project_Presentation.pdf`](ABAY_LNMIIT/NSUT/docs/Project_Presentation.pdf) • Mirror: [`frontend/public/docs/Project_Presentation.pdf`](ABAY_LNMIIT/NSUT/frontend/public/docs/Project_Presentation.pdf)

### Slide Deck Structure (15 Widescreen Slides)

| # | Slide Title | Thematic Category | Core Contents & Visual Highlights |
| :--- | :--- | :--- | :--- |
| **01** | **BreathTwin: A multimodal digital twin for forecasting asthma flare-up risk 24–48 hours ahead** | Project Presentation | Inter-college collaboration (`LNMIIT × NSUT`), core contributors, mission statement, and doctor/patient portal overview. |
| **02** | **The warning signals are spread across different places** | Problem Statement | Clinical history baseline, 20-channel wearable telemetry, and outdoor air quality signals brought together before emergencies. |
| **03** | **One connected workflow, from signals to a useful next step** | Product Overview | End-to-end 5-step flow: Collect, Estimate, Forecast, Explore, and Communicate with digital twin airway state modeling. |
| **04** | **Three layers keep the project understandable** | System Architecture | 3-layer architecture: Input & storage, Hybrid twin engine (TCN + XGBoost + MLP + ODE), and FastAPI services & user interfaces. |
| **05** | **Three streams describe the patient and their environment** | Data Ingestion | 60 static clinical EHR features, 20 wearable channels over 12h rolling windows, and live ambient air quality (`PM2.5`, `PM10`, `AQI`). |
| **06** | **Two base models learn different patterns; a third combines their outputs** | Predictive Pipeline | Stage 1A Dilated TCN, Stage 1B XGBoost suite, and Stage 2 Stacking MLP yielding calibrated 24h/48h risks and 4-tier severity. |
| **07** | **The twin tracks a modelled state the wearable cannot measure directly** | Physiological Twin | Mechanistic SDE simulation of latent airway inflammation I(t) driven by ambient exposure, mucosal clearance, and controller adherence. |
| **08** | **Show the risk trajectory and the signals behind it** | Forecasts & Explainability | Dual forecast horizons (24h flare-up & 48h severe exacerbation), 90% conformal prediction intervals, and inspectable local SHAP feature attributions. |
| **09** | **Ask “what if?” before comparing a prevention plan** | Intervention Sandbox | Counterfactual simulation of preventative actions: outdoor time reduction, N95 respirator filtration, HEPA air purification, and controller adherence. |
| **10** | **Add context when the sensor stream is not the whole story** | Clinical Adaptation | Free-text clinical note extraction to structured parameters and ODE modifiers, with replay buffer and EWC regularization to prevent catastrophic forgetting. |
| **11** | **Start with the cohort, then inspect an individual patient** | Clinician Experience | Outpatient population risk triage roster filtered by city and severity, deep-linking into individual 3D twin, forecast, sandbox, and note adaptation views. |
| **12** | **Turn model output into guidance people can understand** | Patient Companion | Simplified patient dashboard: plain-language daily status, local air outlook, symptom self-reporting logs, and non-prescriptive safety guardrails. |
| **13** | **Strong separation on the project’s synthetic held-out cohort** | Reported Evaluation | Benchmarks against LSTM and XGBoost baselines: 0.9399 (24h ROC-AUC), 0.9428 (48h ROC-AUC), 0.8435 weighted F1, and <65 ms counterfactual latency. |
| **14** | **Built as decision support, with important limits made explicit** | Safety & Limitations | Transparent boundary setting: synthetic cohort integrity, clinician-in-the-loop control, RBAC session logs, and requirements for prospective real-world validation. |
| **15** | **An open-source prototype built by an inter-college team** | Project Handoff | Full technical stack (Next.js, Three.js, FastAPI, PyTorch, PostgreSQL), team roles (Aarush Bhattacharjee & Rakshit Gupta), MIT license, and source repository. |

---

## 12. Public Access and Reproducibility

All documents, model checkpoints, datasets, and source files are stored directly inside this public repository and require **zero external permissions**:

- **Architecture Diagram (PDF & SVG)**: [`docs/Architecture_Diagram.pdf`](ABAY_LNMIIT/NSUT/docs/Architecture_Diagram.pdf) • [`docs/Architecture_Diagram.svg`](ABAY_LNMIIT/NSUT/docs/Architecture_Diagram.svg)
- **Project Presentation (Universal PDF)**: [`docs/Project_Presentation.pdf`](ABAY_LNMIIT/NSUT/docs/Project_Presentation.pdf)
- **Open-Source License (MIT)**: [`LICENSE`](LICENSE)
- **Trained Model Checkpoints**:
  - Stage-1A Dilated TCN: [`aasthma/training/model1/digital_twin_model.pt`](ABAY_LNMIIT/NSUT/aasthma/training/model1/digital_twin_model.pt)
  - Stage-1B XGBoost Suite: [`aasthma/training/model2/gb_digital_twin_models.pkl`](ABAY_LNMIIT/NSUT/aasthma/training/model2/gb_digital_twin_models.pkl)
  - Stage-2 MLP Meta-Learner: [`aasthma/training/meta_ensemble_model.pt`](ABAY_LNMIIT/NSUT/aasthma/training/meta_ensemble_model.pt) & [`aasthma/training/meta_ensemble_config.json`](ABAY_LNMIIT/NSUT/aasthma/training/meta_ensemble_config.json)

---

## 13. Quick Start and Execution Guide

### 13.1 System Prerequisites

Before running BreathTwin, ensure the following tools are installed:

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Linux (Ubuntu 20.04+), macOS (12+), Windows (WSL2) | Linux x86-64 | Native POSIX environment recommended |
| **Python** | 3.11 | 3.11 or 3.12 | Required for FastAPI backend and PyTorch ML stack |
| **Node.js & npm** | Node 18.x, npm 9.x | Node 20.x LTS | Required for Next.js 16 frontend |
| **Docker & Compose** | Docker 24.x, Docker Compose v2 | Docker Engine + Compose v2 | Required for local PostgreSQL 16 container |
| **Hardware** | 4 CPU cores, 8 GB RAM | 8 CPU cores, 16 GB RAM | CUDA-compatible GPU optional for retraining |

### 13.2 Clone and Environment Configuration

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Frisbee148/DigitalTwin.git
   cd DigitalTwin
   ```

2. **Configure Environment Variables**:
   BreathTwin utilizes two `.env` locations depending on the process boundary:
   - **Root `.env`**: Used by Docker Compose and root orchestration scripts.
   - **`aasthma/.env`**: Read directly by the FastAPI backend (`aasthma/server.py`).

   Create both files from the provided defaults:
   ```bash
   cp .env.example .env
   cp .env.example aasthma/.env
   ```

   Key configuration variables:
   ```ini
   # Database Connection (matches docker-compose.yml)
   DATABASE_URL=postgresql://synclave:synclave@localhost:5432/breathtwin

   # Application Secret Key
   SECRET_KEY=breathtwin-secure-jwt-telemetry-key-2026-production

   # Optional: External LLM Clinical Copilot Keys (leave empty for offline deterministic fallback)
   OPENAI_API_KEY=
   HF_TOKEN=
   ```

### 13.3 One-Command Startup (Linux / macOS)

The fastest way to launch the complete system (PostgreSQL 16, FastAPI backend, and Next.js frontend) is using `run.sh`:

```bash
./run.sh
```

To stop all background services cleanly:

```bash
./stop.sh
```

### 13.4 Manual Step-by-Step Setup

If you prefer to start each service individually:

1. **Launch PostgreSQL 16**:
   ```bash
   docker compose up -d
   ```

2. **Set Up Python Virtual Environment & Install Dependencies**:
   ```bash
   python3 -m venv aasthma/.venv
   source aasthma/.venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Start the FastAPI Backend Service**:
   ```bash
   PYTHONPATH=. uvicorn aasthma.server:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Install Frontend Dependencies & Start Next.js**:
   ```bash
   npm install --prefix frontend
   npm run dev --prefix frontend
   ```

### 13.5 Database Initialization & Seeding

- On initial startup, the FastAPI server automatically executes `Base.metadata.create_all(bind=engine)` via SQLAlchemy, generating all relational tables (`user_accounts`, `patients`, `timeseries_telemetry`, `patient_daily_logs`, `clinical_events`, `experience_replay`).
- The backend automatically seeds demo patients (`PT-8821`, `PT-4409`, `PT-1923`, etc.) and default test credentials into the database if the tables are empty.
- To reset demo data to pristine state, restart the database container with volume removal:
  ```bash
  docker compose down -v && docker compose up -d
  ```

### 13.6 Service Health & URL Verification

Once started, verify service readiness at the following endpoints:

| Service | Expected URL | Verification Method |
| :--- | :--- | :--- |
| **Next.js Web Frontend** | `http://localhost:3000` | Browser loads landing page and login portal |
| **FastAPI Interactive Docs (Swagger)** | `http://localhost:8000/docs` | OpenAPI documentation and interactive endpoint testing |
| **Backend Health Check** | `http://localhost:8000/` | Returns JSON status `{"status": "healthy"}` |
| **PostgreSQL 16 Container** | `localhost:5432` | `docker ps` shows container `breathtwin-postgres` healthy |

### 13.7 Automated Test Execution

Run the automated P0 test suite using the configured virtual environment:

```bash
PYTHONPATH=. aasthma/.venv/bin/pytest aasthma/tests/test_p0.py -v
```

The test suite exercises (21 automated tests, 100% pass rate):
- Cohort data loading and 60-feature static / 20-channel dynamic dimensions (`test_fr1_fr2_cohort_loading`).
- Simulation clock replay synchronization (`test_fr4_simulation_clock`).
- Mechanistic ODE window integration and baseline counterfactuals (`test_fr8_ode_simulation`).
- Counterfactual intervention sandbox physics (`test_fr10_what_if_sandbox`).
- 90% split-conformal prediction intervals schedule (`test_fr16_conformal_uncertainty`).
- Acoustic microphone audio streaming and YamNet cough detection (`test_acoustic_telemetry_flow`).
- Doctor-triggered acoustic outlier digital twin re-scoring (`test_acoustic_outlier_model_inference`).
- Webcam video frame ingestion and facial distress tracking (`test_visual_telemetry_flow`).
- Doctor-triggered multimodal (acoustic + visual) outlier inference (`test_multimodal_outlier_model_inference`).
- REST API endpoint contracts and JSON schema responses.

### 13.8 Troubleshooting Guide

| Issue | Likely Cause | Resolution |
| :--- | :--- | :--- |
| **Port 5432 / 8000 / 3000 Conflict** | Another PostgreSQL, FastAPI, or Node process is using the port. | Identify with `lsof -i :<port>` or `netstat -tuln` and terminate conflicting process, or alter host mapping in `docker-compose.yml` / `run.sh`. |
| **XGBoost / PyTorch Device Warning** | No NVIDIA GPU detected (`UserWarning: Device changed from GPU to CPU`). | This warning is harmless. The inference engine and XGBoost automatically fall back to CPU execution without loss of precision. |
| **Hugging Face / OpenAI 401 Unauthorized** | Missing or expired API key in `.env`. | BreathTwin automatically switches to its offline deterministic regex and clinical ontology extractor. Predictions, ODE simulations, and triage operate normally. |
| **Frontend Cannot Connect to Backend** | Next.js API client points to wrong port. | Confirm FastAPI is running on `http://localhost:8000`. The frontend defaults to `http://localhost:8000` via `frontend/lib/api.ts`. |

### 13.9 REST API Reference & Sample Request

FastAPI exposes an interactive OpenAPI Swagger interface at `http://localhost:8000/docs`.

**Example: Predict 24h & 48h Risk for Patient `PT-8821`**

```bash
curl -X POST "http://localhost:8000/api/predict/PT-8821" \
     -H "Content-Type: application/json" \
     -d '{"hour": 168}'
```

**Example Response**:
```json
{
  "patient_id": "PT-8821",
  "hour": 168,
  "risk_24h": 78.4,
  "risk_48h": 84.2,
  "severity_grade": 2,
  "severity_label": "Moderate",
  "conformal_interval_24h": [68, 88],
  "conformal_interval_48h": [74, 94],
  "estimated_inflammation": 0.72,
  "top_shap_features": [
    {
      "feature": "Nocturnal SpO2 Dip",
      "impactPercent": 28.4,
      "direction": "INCREASES_RISK"
    },
    {
      "feature": "Ambient PM2.5 Surge",
      "impactPercent": 22.1,
      "direction": "INCREASES_RISK"
    }
  ]
}
```

#### 13.9.1 Real-Time Biosensor & Multimodal Outlier Endpoints

| Endpoint | Method | Input Payload | Output Summary |
| :--- | :--- | :--- | :--- |
| `/api/patients/{id}/audio-stream` | `POST` | `{"audio_base64": "...", "sample_rate": 16000, "client_coughs": 2}` | YamNet & STFT cough classification, instantaneous severity (0–3), live asthma attack chances % |
| `/api/patients/{id}/acoustic-telemetry` | `GET` / `POST` | `limit=24` (GET) or `AcousticTelemetryPostRequest` (POST) | 24h acoustic time-series logs (hourly cough count, wheeze %, stridor, jitter, shimmer) |
| `/api/patients/{id}/acoustic-inference` | `POST` | `{"hourly_cough_count": 22, "cough_severity": 3, "wheeze_percent_duration": 25.0}` | Re-scores 24h & 48h twin risks using acoustic cough load coupled with latent airway ODE |
| `/api/patients/{id}/video-stream` | `POST` | `{"image_base64": "...", "client_mar": 0.42, "client_flaring": 0.30}` | Facial respiratory distress grade (0–3), mouth breathing status, video RR, optical rPPG pulse |
| `/api/patients/{id}/visual-telemetry` | `GET` / `POST` | `limit=24` (GET) or `VisualTelemetryPostRequest` (POST) | 24h visual time-series logs (mouth breathing ratio, nasal flaring, head bobbing, video RR) |
| `/api/patients/{id}/multimodal-inference` | `POST` | `{"acoustic": {...}, "visual": {...}}` | Clinician action fusing both acoustic microphone and webcam facial distress into the full twin ensemble |

---

## 14. Security and Privacy

### 14.1 Local Development & Synthetic Demo Boundary

The default accounts and seeded credentials (`doctor@synclave.health`, etc.) published in [Section 15](#15-default-login-credentials) are intended **strictly for local development, automated testing, and demonstration on synthetic data**.

> [!CAUTION]
> **Production Deployment Warning**:  
> Under no circumstances should seeded development credentials or static session secrets be exposed in a publicly accessible network environment. Production deployments require:
> - Integration with enterprise OAuth2 / OpenID Connect identity providers.
> - Multi-factor authentication (MFA).
> - Secret storage via cloud-native key management services (KMS / HashiCorp Vault).
> - HTTPS enforcement and strict CORS origin boundaries.

### 14.2 External LLM Data Flow & Privacy

- When `OPENAI_API_KEY` or `HF_TOKEN` are configured, the application makes outbound API calls exclusively for Stage-3 Patient Copilot generation and unstructured clinical note feature extraction.
- **Zero Real Patient PHI Transmitted**: All data processed by BreathTwin consists of synthetic vitals, synthetic free-text observations, and public meteorological data. No real human medical records or personally identifiable data ever leave the machine.
- **Offline Mode**: If external LLM calls must be avoided entirely, leaving API keys unconfigured directs the backend to use its built-in deterministic clinical regex and ontology parser without any external network egress.

### 14.3 Role-Based Access Control (RBAC)

Role-based authorization is enforced at the backend service layer via FastAPI route dependencies, ensuring that:
- Patient personas can access only their own individual telemetry and daily symptom logs (`/patient-portal`).
- Clinician actions (cohort risk sorting, What-If simulation parameter overrides, clinical note commits, and EWC retraining) require authenticated clinician role tokens.

### 14.4 Responsible Security Disclosure

If you identify a security issue, vulnerability, or secret leakage concern in this repository, please report it directly to the repository maintainers via GitHub Security Advisories or by emailing the project maintainers privately rather than opening a public issue.

---

## 15. Default Login Credentials

All user accounts are pre-seeded into the PostgreSQL `user_accounts` table for local demonstration:

| Role | Email | Password | Assigned Scope & Data Context |
| :--- | :--- | :--- | :--- |
| **Doctor / Clinician** | `doctor@synclave.health` | `doctor123` | Full Outpatient Cohort Triage, 3D/Thermal Pulmonary Viewport, 24h & 48h Conformal Forecasts, What-If Sandbox, Note Adaptation |
| **Patient (Aarush Sen)** | `patient0@synclave.health` | `patient123` | Personal Patient Portal (`PT-8821` • New Delhi, Anand Vihar CPCB) |
| **Patient (Priya Nair)** | `patient12@synclave.health` | `patient123` | Personal Patient Portal (`PT-4409` • Mumbai, Chembur MPCB) |
| **Patient (Rajesh Sharma)** | `patient3@synclave.health` | `patient123` | Personal Patient Portal (`PT-1923` • New Delhi, RK Puram DPCC) |

---

## 16. References

1. **Salvi, S., et al. (2018).** "The burden of chronic respiratory diseases and their heterogeneity across the states of India: the Global Burden of Disease Study 1990–2016." *The Lancet Global Health*, 6(12), e1363–e1374. DOI: [10.1016/S2214-109X(18)30409-1](https://doi.org/10.1016/S2214-109X(18)30409-1). PMID: 30219315.
2. **Guarnieri, M., & Balmes, J. R. (2014).** "Outdoor air pollution and asthma." *The Lancet*, 383(9928), 1581–1592. DOI: [10.1016/S0140-6736(14)60617-6](https://doi.org/10.1016/S0140-6736(14)60617-6). PMID: 24792855.
3. **Gong, H., et al. (2003).** "Controlled exposure of healthy and asthmatic volunteers to concentrated ambient fine particles in Los Angeles." *Inhalation Toxicology*, 15(4), 305–325. DOI: [10.1080/08958370304455](https://doi.org/10.1080/08958370304455). PMID: 12652758.
4. **Ghio, A. J., et al. (2000).** "Concentrated ambient air particles induce mild pulmonary inflammation in healthy human volunteers." *American Journal of Respiratory and Critical Care Medicine*, 162(3), 981–988. DOI: [10.1164/ajrccm.162.3.9911115](https://doi.org/10.1164/ajrccm.162.3.9911115). PMID: 10988117.
5. **Barnes, P. J. (2010).** "Mechanisms and resistance in glucocorticoid control of asthma." *Journal of Allergy and Clinical Immunology*, 126(3), 443–453. DOI: [10.1016/j.jaci.2010.02.034](https://doi.org/10.1016/j.jaci.2010.02.034).
6. **Global Initiative for Asthma (GINA). (2023).** "Global Strategy for Asthma Management and Prevention." *European Respiratory Journal*, 62(5), 2301053. DOI: [10.1183/13993003.01053-2023](https://doi.org/10.1183/13993003.01053-2023).
7. **Graudenz, G. S., et al. (2006).** "Association of air temperature and humidity with asthma flare-ups." *Chest*, 129(3), 645–649. DOI: [10.1378/chest.129.3.645](https://doi.org/10.1378/chest.129.3.645).
8. **Frey, U., et al. (2005).** "Risk of severe asthma attacks in relation to fluctuations in lung function." *American Journal of Respiratory and Critical Care Medicine*, 172(7), 801–807. DOI: [10.1164/rccm.200404-517OC](https://doi.org/10.1164/rccm.200404-517OC).
9. **Pant, P., et al. (2017).** "Indoor-outdoor relationships of particulate matter in urban Indian environments." *Environmental Pollution*, 223, 208–218. DOI: [10.1016/j.envpol.2016.03.064](https://doi.org/10.1016/j.envpol.2016.03.064).
10. **National Institute for Occupational Safety and Health (NIOSH) / CDC. (2020).** "Evaluation of Particle Penetration and Breathing Resistance of Filtering Facepiece Respirators." DHHS (NIOSH) Publication No. 2020-120. DOI: [10.26616/NIOSHPUB2020120](https://doi.org/10.26616/NIOSHPUB2020120).
11. **Kirkpatrick, S., et al. (2017).** "Overcoming catastrophic forgetting in neural networks." *Proceedings of the National Academy of Sciences (PNAS)*, 114(13), 3521–3526. DOI: [10.1073/pnas.1611835114](https://doi.org/10.1073/pnas.1611835114).
12. **Vovk, V., Gammerman, A., & Shafer, G. (2005).** *Algorithmic Learning in a Random World*. Springer Science & Business Media. DOI: [10.1007/b106715](https://doi.org/10.1007/b106715).

---

## 17. Clinical Disclaimer

BreathTwin is an **investigational engineering prototype** developed exclusively for biomedical computational research and decision-support exploration. The software evaluates synthetic patient cohorts and computes statistical exacerbation risk probabilities; it does not provide medical diagnoses, clinical determinations, or autonomous prescribing instructions. All clinical decisions, pharmacological interventions, and patient care regimens must remain under the direct authority of licensed medical professionals.
