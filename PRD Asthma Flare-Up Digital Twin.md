# PRD: Asthma Flare-Up Digital Twin

Oct 11, 2026 · @Aarush Bhattacharjee

## 1. Overview

BreathTwin (working title) is a digital twin of one asthma patient that predicts a flare-up 24 to 48 hours ahead and shows the doctor why.

The twin fuses three streams: a synthetic electronic health record (EHR), simulated wearable signals (SpO2, respiratory rate, heart rate, HRV, sleep, steps) and real open air-quality data. A hidden airway-inflammation state links them, so the twin can also answer what-if questions such as "what happens if this patient stays indoors tomorrow?"

The deliverable is a working prototype, not a clinical product: a data simulator, a trained model, a doctor-facing dashboard and the documentation the submission form requires.

## 2. Problem statement and healthcare use case

Asthma patients in polluted Indian cities get flare-ups that neither they nor their doctors can anticipate, so care stays reactive and often ends in an emergency visit.

- **Pain point:** fine-particle pollution (PM2.5) and weather swings are known triggers, but nothing joins a patient's own history, their body's early signals and tomorrow's air quality into one personal forecast.
- **Gap:** clinic visits are months apart, so the days before a flare-up are invisible to the doctor.
- **Use case:** a doctor opens a virtual patient, sees the 24 to 48 hour flare-up risk with its reasons, and tests interventions (stay indoors, wear an N95 mask, adjust controller medication) before advising the real patient.

The twin covers one condition and one adverse event, as the brief requires. Asthma prevalence in India and the evidence linking pollution to exacerbations must be cited from published sources before submission (see Open questions).

## 3. Goals, non-goals and success metrics

The product succeeds if it forecasts a flare-up early enough to act on, with few enough false alarms that a doctor would trust it.

**Goals**

- Predict a flare-up 24 to 48 hours ahead from fused EHR, wearable and air-quality data.
- Explain every alert in plain terms a doctor can check.
- Let the doctor change an input and see the forecast change.
- Ship a reproducible, documented repo that meets every submission item.

**Non-goals**

- No diagnosis, no treatment decisions, no regulatory claims.
- No real patient data, and no whole-body twin.
- No mobile app for patients (a mock-up is enough).

**Success metrics (proposed targets, to be confirmed after the first baseline run)**

| Metric | Proposed target |
| --- | --- |
| Lead time before a flare-up | At least 24 hours |
| Precision-recall AUC | Higher than every baseline in section 12 |
| False alarms | No more than 1 per patient per week at the chosen alert threshold |
| Calibration | Predicted risk matches observed frequency (Brier score and calibration plot reported) |
| EHR and air-quality value | Ablations show each stream improves the score |

## 4. Users and personas

The primary user is the treating doctor; the patient is the subject of the twin and a secondary audience for alerts.

| Persona | Need | What the product gives them |
| --- | --- | --- |
| Doctor (pulmonologist or primary-care physician) | Know which patients are about to deteriorate, and why, between visits | Ranked patient list, 48-hour risk forecast, reasons, what-if tests |
| Patient (the virtual patient in the demo) | Avoid a flare-up and an emergency visit | Mock-up of a plain-language alert and a suggested action |

**Demo persona (invented for the video):** a working adult with moderate persistent asthma who commutes through heavy traffic in a high-pollution city. The demo follows this one patient through a week: a pollution spike, early signal drift, an alert, the doctor's investigation and a what-if intervention that lowers the forecast.

## 5. Challenge compliance matrix

Every requirement in the brief maps to a concrete part of this product.

| Brief requirement | How BreathTwin meets it |
| --- | --- |
| One chronic or lifestyle condition prevalent in India | Asthma, with pollution as the lifestyle and environmental trigger (cite prevalence before submission) |
| Static or historical data: simulated EHR | Synthetic patient records: demographics, diagnoses, lung-function results, past flare-ups, medications |
| Dynamic data: simulated or open wearable time series | Simulated SpO2, respiratory rate, heart rate, HRV, sleep stages and step count |
| Fusion of the two streams in one model | The EHR embedding conditions the temporal model; an ablation proves it helps |
| Predict an adverse event | Flare-up within the next 24 and 48 hours |
| Conceptual doctor dashboard | Working dashboard prototype with risk, reasons and what-if panel |
| Anonymized, open-source or synthetic data only | All patient data synthetic; air quality and weather from open public sources |
| Public GitHub repo with README items | See section 15 checklist |
| Video, architecture diagram, presentation, license | See section 15 checklist |
| Folder name TeamName\_CollegeName; team of 1 to 4 full-time students | Repo root named per the rule; team details in README |

## 6. System architecture

Three input streams are validated and replayed on a simulation clock into the twin core, which serves the doctor dashboard.

&#91;embedded content: system architecture · 3 inputs, 1 twin core, 1 dashboard\]

The what-if simulator sends changed inputs back to the twin core, which re-runs the forecast and returns the new risk. The twin core is the only component that holds patient state; the dashboard only reads and requests simulations.

## 7. Data strategy

Patient data is synthetic and built from a causal simulator; only the air-quality and weather inputs are real.

| Stream | Source | Real or synthetic | Notes |
| --- | --- | --- | --- |
| EHR | Synthea, customized, plus a custom generator | Synthetic | Check Synthea's asthma module; adjust demographics, severity mix and exposure history to an Indian cohort |
| Wearable signals | Own simulator (section 8) | Synthetic | Baseline ranges taken from published literature, one citation per parameter |
| Air quality | OpenAQ or CPCB historical PM2.5 and PM10 | Real, open | Check each source's license and terms before redistributing |
| Weather | Open-Meteo | Real, open | Temperature, humidity; used as secondary triggers |
| Labels (flare-up or not) | Simulator's latent state | Synthetic | Operational definition fixed in a config file (section 8) |

**Generation rules**

1. Simulate causality first: exposure and triggers drive a hidden state that drives the signals. A GAN alone cannot do this because it has no real data to learn from.
2. Optionally add a generative realism layer (for example TimeGAN or a diffusion model) for sensor noise and dropout, never for labels.
3. Keep every coefficient in one versioned config with a citation field, so assumptions are auditable.
4. Use fixed random seeds so the cohort is reproducible.
5. Avoid circular evaluation: test on simulator settings the model never saw (section 12), and on any small real wearable dataset that can be found.
6. Every prediction uses only values known at that moment; slow variables such as lung-function results update at simulated clinic visits.

## 8. Simulator design

Each virtual patient carries a hidden airway-inflammation state, and every wearable signal is a noisy, delayed reflection of it.

The state I(t) rises with inhaled pollutant dose and other triggers, falls with controller medication, and decays on its own:

```latex
\frac{dI}{dt} = -k\,I + a\,\mathrm{Dose}_{PM}(t) + b\,\mathrm{Trigger}(t) - c\,\mathrm{Controller}(t) + \sigma\,\xi(t)
```

Here k is the recovery rate, Dose is inhaled pollutant dose (outdoor level times time outdoors, reduced by an N95 or by staying indoors), Trigger covers cold air, humidity and viral or allergen periods, and the last term is random noise. Each patient's k, a, b, c and flare-up threshold are drawn from distributions conditioned on their EHR (severity, baseline lung function, controller adherence).

**Signals generated from the state**

| Signal | Change as I(t) rises | Notes |
| --- | --- | --- |
| Respiratory rate (resting) | Up | Early signal, small lag |
| SpO2 | Down, with more night-time dips | Add motion and sensor noise |
| Resting heart rate | Up |  |
| HRV | Down |  |
| Sleep | More awakenings, less deep sleep | Night-time symptoms |
| Steps | Down | Patient avoids exertion |
| Rescue-inhaler use | Up | Optional smart-inhaler stream |

**Event definition (fixed in config):** a flare-up occurs when I(t) stays above the patient's threshold for a set number of hours with rising rescue-inhaler use. Align the wording with a published severe-exacerbation definition (for example the ATS/ERS statement) and cite it.

Every effect size is an assumption and is listed in the config with its source. Sensor noise, missing hours and motion artefacts are injected on purpose so the model is not trained on clean data.

## 9. Twin model

The twin is hybrid: a mechanistic state estimator gives it physiology, and a neural forecaster learns what the mechanism misses.

1. **Personal baselines.** Each signal is expressed as deviation from that patient's own rolling baseline, because normal heart rate or SpO2 differs between people.
2. **State estimator.** A filter (for example a Kalman or particle filter) estimates the hidden inflammation state from the observed signals and exposure. This is what makes it a twin: a live, patient-specific internal state.
3. **Forecaster.** A temporal network (a GRU or temporal convolution network; a Temporal Fusion Transformer as a stretch) reads the last 7 days of signals, the estimated state and the air-quality forecast. The EHR embedding conditions it through FiLM layers or gating rather than being concatenated, so history changes how the model reads the signals. Outputs: flare-up probability for the next 24 and 48 hours.
4. **Uncertainty.** A deep ensemble or Monte Carlo dropout, calibrated with conformal prediction, gives a risk range, not just a number.
5. **Alert policy.** Alert only when risk is above a threshold and uncertainty is below a limit. The threshold is chosen to keep false alarms under the target in section 3.
6. **Explanations.** Feature attributions (SHAP or integrated gradients) plus the state decomposition give reasons such as "PM2.5 spike, resting respiratory rate up, poor sleep last night".
7. **What-if engine.** The mechanistic part is re-run with changed inputs (less exposure, N95, controller adherence) and the forecaster re-scores the result.

**Training rules:** split by patient, then by time; weight or resample for rare flare-ups; never use a value that was not yet known at prediction time.

## 10. Functional requirements

P0 items are the minimum viable submission; P1 and P2 are added as time allows.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Generate a reproducible synthetic cohort of patients with EHR fields, from a seed | P0 |
| FR-2 | Simulate wearable and rescue-inhaler time series from each patient's hidden state | P0 |
| FR-3 | Load real historical and forecast air-quality and weather data for a chosen city | P0 |
| FR-4 | Replay all streams through a simulation clock as a live feed | P0 |
| FR-5 | Forecast flare-up probability for the next 24 and 48 hours per patient | P0 |
| FR-6 | Raise an alert with ranked reasons when the alert policy fires | P0 |
| FR-7 | What-if panel: stay indoors, N95 mask, controller adherence change; re-forecast on demand | P0 |
| FR-8 | Doctor dashboard with patient list, patient detail and alert view | P0 |
| FR-9 | Show risk ranges and calibration, not only point estimates | P1 |
| FR-10 | Handle missing sensor hours and noisy readings without failing | P1 |
| FR-11 | Cohort view ranking patients by risk | P1 |
| FR-12 | Assumptions page listing every simulator coefficient and its citation | P1 |
| FR-13 | Privacy sketch: federated-learning or on-device inference diagram, no code required | P2 |
| FR-14 | Extension to COPD using the same pipeline | P2 |

## 11. Doctor dashboard

The dashboard lets a doctor go from "who is at risk" to "why" to "what would help" in three clicks.

| Screen | What the doctor sees | Interaction |
| --- | --- | --- |
| Patient list | Patients ranked by 48-hour risk, with alert badges | Sort, filter, open a patient |
| Virtual patient | Profile from the EHR, current estimated inflammation state, live signals against the patient's baseline | Scrub through the simulated week |
| Forecast | 24 and 48 hour risk with a range, plus the air-quality forecast on the same timeline | Hover for values |
| Alert detail | Ranked reasons, for example "PM2.5 spike, respiratory rate up 3 breaths per minute, poor sleep" | Expand a reason to see its signal |
| What-if panel | Sliders and toggles: time outdoors, N95, controller adherence | Re-run and compare the new forecast with the original |
| Assumptions | Every simulator coefficient and the citation behind it | Read only |

Design rules: show uncertainty beside every risk number, state plainly that the tool estimates risk and does not diagnose, and never show a number without its reasons.

## 12. Evaluation plan

The evaluation is designed to show the model learned physiology-like structure, not just the generator's quirks.

| Check | Method | Metrics |
| --- | --- | --- |
| Baselines | Air-quality threshold rule; EHR-only logistic regression; wearable-only GRU; the full twin | Precision-recall AUC, ROC AUC |
| Ablations | Remove the EHR stream; remove air quality; remove the state estimator | Change in precision-recall AUC |
| Alert quality | Sweep the alert threshold | Lead time, precision, recall, false alarms per patient per week |
| Calibration | Reliability curve on held-out patients | Brier score, expected calibration error |
| Robustness | Drop sensor hours, add noise, use an unseen city's air-quality pattern | Score drop at each level |
| Generator shift | Train on one set of simulator coefficients, test on perturbed coefficients | Score drop (guards against circular evaluation) |
| Explanations | Check that attributions point to the true simulated drivers | Agreement rate |

Splits are by patient, then by time. Results are reported with confidence intervals across seeds.

**Honest limit:** results on synthetic data show the pipeline works; they do not prove clinical validity. State this in the README and the video.

## 13. Non-functional requirements

The product must be private by design, reproducible by anyone, and honest about what it can and cannot do.

- **Privacy:** no real patient data anywhere; synthetic records carry no real identifiers; the design follows data minimization and de-identification in the spirit of the DPDP Act, and the README says so.
- **Reproducibility:** one command (`docker compose up`) starts the whole stack; seeds fixed; unit tests for the simulator and the alert policy; continuous integration on every push.
- **Explainability:** every alert carries ranked reasons.
- **Safety messaging:** the dashboard states that it estimates risk and does not diagnose.
- **Performance (proposed):** the dashboard refreshes a patient's forecast in about 2 seconds or less on a laptop.
- **Licensing:** code under an open-source license (for example MIT or Apache-2.0); third-party data licenses listed separately.
- **Documentation:** every simulator coefficient has a citation in the config.

## 14. Tech stack

Python carries the data and modelling work; a small service layer and a web dashboard make it demonstrable.

| Layer | Choice | Why |
| --- | --- | --- |
| Cohort and EHR | Synthea plus a Python generator | Standard synthetic records, customizable |
| Simulator | Python, NumPy, SciPy | Latent-state equations and signal generation |
| Air quality and weather | OpenAQ or CPCB data, Open-Meteo | Real, open sources |
| Stream replay | FastAPI service with a simulation clock and Redis Streams | Gives a live-feed demo with latency numbers |
| Storage | PostgreSQL (TimescaleDB) or Parquet with DuckDB | Time-series queries, simple local setup |
| Modelling | PyTorch; scikit-learn for baselines | Temporal network and baselines |
| Uncertainty and explanations | Conformal prediction library, SHAP or Captum | Calibrated ranges, attributions |
| Dashboard | React with Plotly or Recharts (Streamlit if speed matters more) | Interactive what-if panel |
| Packaging and quality | Docker Compose, pytest, GitHub Actions | One-command run, tests, CI |

## 15. Deliverables and README checklist

The submission form lists 12 items, all mandatory and all required in the README of a public GitHub repo.

- [ ] Team details
- [ ] College or incubator information
- [ ] Project title
- [ ] Problem statement
- [ ] Healthcare use case
- [ ] Technical stack
- [ ] AI/ML model or framework details
- [ ] Demo video as an unlisted YouTube link in the README (the form says 15 to 20 minutes, the brief says at least 20; aim for about 20)
- [ ] Open-source license details, with a LICENSE file in the repo
- [ ] Architecture diagram committed as PDF or PPT and linked from the README
- [ ] Presentation committed as PDF or PPT with project details and outcomes
- [ ] All files and links publicly accessible without extra permissions (test in a private browser window)

Also: name the repo folder `TeamName_CollegeName`, and on the submission platform give only the team leader's name, phone number, email and the public repo link.

## 16. Risks, limitations and mitigations

The largest risk is that judges see synthetic data and assume the results mean nothing, so the plan answers that directly.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Synthetic data and circular evaluation | Results look inflated | Generator-shift tests, baselines, a real wearable sample if one is found, plain statement of limits |
| Invented effect sizes | Credibility | Each coefficient in config with a citation; assumptions page in the dashboard |
| Consumer SpO2 is noisy and less accurate with motion and on darker skin | Missed or false alerts | Inject noise in simulation, report robustness, state the limit in the README |
| Signals are non-specific (a cold or poor sleep looks similar) | False alarms | Estimate risk not diagnosis; alert only when uncertainty is low; report false alarms per week |
| Asthma may be questioned as in scope | Disqualification risk | Chronic condition with a lifestyle trigger; confirm with organizers (section 18) |
| Dataset license limits | Legal problems | Check OpenAQ, CPCB and Synthea terms; list them in the README |
| Scope creep | Unfinished demo | Build P0 first, keep one condition and one event |
| Video too short or long | Rule breach | Aim for about 20 minutes and check the form's 15 to 20 minute wording against the brief |

## 17. Differentiators and build order

The project stands out by being a real twin (a live hidden state and a what-if engine) rather than another forecaster.

**What sets it apart**

- A third data stream, real air quality, on top of EHR and wearables.
- A hybrid mechanistic plus neural model with an ablation proving the EHR stream helps.
- A working what-if simulator, not just a mock-up.
- India-specific framing: pollution exposure and cohort calibration.
- Alert quality reported the way clinicians judge it: lead time and false alarms per patient per week.
- Explanations attached to every alert.
- A reproducible, tested repo that starts with one command.

**Build order (by dependency, not by date)**

1. Fix the event definition and the config format, then write the simulator and the cohort generator.
2. Load air-quality and weather data and join it to the simulated patients.
3. Train the baselines, then the full model; run the ablations.
4. Add uncertainty, the alert policy and explanations.
5. Build the replay service and the what-if engine.
6. Build the dashboard on top of the service.
7. Run the full evaluation, then write the README, record the video and produce the diagram and presentation.

## 18. Open questions to confirm

These need an answer before the build locks in.

- [ ] Does the organizers' brief accept asthma as a chronic condition prevalent in India? A short email for written confirmation removes the risk.
- [ ] Which city's air-quality pattern anchors the cohort and the demo?
- [ ] What are the team name, college and team size (1 to 4 full-time students) for the README?
- [ ] Which published sources will be cited for asthma prevalence in India, pollution-exacerbation links and each simulator effect size?
- [ ] Is a small real wearable dataset with respiratory signals available for a sanity check?
- [ ] Which license (MIT or Apache-2.0) fits all dependencies and data terms?
- [ ] Video length: the form says 15 to 20 minutes and the brief says at least 20; confirm which applies.
