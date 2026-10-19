#!/usr/bin/env python3
"""Generate Architecture_Diagram.svg, Architecture_Diagram.pdf, and Project_Presentation.pdf."""

import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfgen import canvas

ROOT = Path("/home/casp1an/Code/DigiTwin")
DOCS_DIR = ROOT / "docs"
PUBLIC_DOCS_DIR = ROOT / "frontend" / "public" / "docs"
PUBLIC_DIR = ROOT / "frontend" / "public"

DOCS_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DOCS_DIR.mkdir(parents=True, exist_ok=True)

SVG_CONTENT = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" width="100%" height="100%" font-family="monospace, sans-serif">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020A05"/>
      <stop offset="100%" stop-color="#04150B"/>
    </linearGradient>
    <marker id="arrowGreen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 8 5 L 0 9 z" fill="#4CFF8A"/>
    </marker>
    <marker id="arrowYellow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 8 5 L 0 9 z" fill="#FFE14A"/>
    </marker>
    <marker id="arrowCyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 8 5 L 0 9 z" fill="#5CFF95"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="1200" height="720" fill="url(#bgGrad)" stroke="#12612F" stroke-width="2"/>

  <!-- Header Banner -->
  <rect x="20" y="18" width="1160" height="54" fill="#04130A" stroke="#12612F" stroke-width="1.5"/>
  <text x="38" y="42" fill="#4CFF8A" font-size="15" font-weight="bold" letter-spacing="1.5">BREATHTWIN (DIGITALTWIN) // MULTIMODAL SYSTEM &amp; CODEBASE ARCHITECTURE</text>
  <text x="38" y="61" fill="#75FFA5" font-size="11">Three-Stream Data Fusion • Mechanistic Latent ODE Simulator • Stacked Dilated-TCN + XGBoost + MLP Ensemble • Dual Clinical/Patient Interfaces</text>
  <text x="1160" y="42" fill="#FFE14A" font-size="11" font-weight="bold" text-anchor="end">ASD-STE100 COMPLIANT SPEC</text>
  <text x="1160" y="61" fill="#3DE07A" font-size="10" text-anchor="end">ROC-AUC 24H: 0.940 | 48H: 0.943</text>

  <!-- ======================================================================= -->
  <!-- COLUMN 1: DATA INGESTION & PERSISTENCE (x=20..300)                      -->
  <!-- ======================================================================= -->
  <rect x="20" y="88" width="275" height="612" fill="#031008" stroke="#12612F" stroke-width="1.5"/>
  <rect x="20" y="88" width="275" height="28" fill="#061C0E" stroke="#12612F" stroke-width="1"/>
  <text x="32" y="106" fill="#4CFF8A" font-size="11" font-weight="bold">01. MULTIMODAL INPUT STREAMS</text>

  <!-- Stream 1: Static EHR -->
  <rect x="34" y="130" width="247" height="106" fill="#04130A" stroke="#1D8348" stroke-width="1.2"/>
  <text x="44" y="148" fill="#3DE07A" font-size="10" font-weight="bold">STREAM 01 • STATIC EHR (60 FEATURES)</text>
  <text x="44" y="165" fill="#FFFFFF" font-size="12" font-weight="bold">Patient Clinical Baseline</text>
  <text x="44" y="182" fill="#75FFA5" font-size="10">• Demographics, BMI, Smoking Pack-Yrs</text>
  <text x="44" y="197" fill="#75FFA5" font-size="10">• Spirometry: FEV1%, FEV1/FVC, PEF</text>
  <text x="44" y="212" fill="#75FFA5" font-size="10">• ICS Controller &amp; Prior ICU History</text>
  <text x="44" y="227" fill="#5CFF95" font-size="9">Path: aasthma/dataset/data/static/</text>

  <!-- Stream 2: Wearable Telemetry -->
  <rect x="34" y="250" width="247" height="118" fill="#04130A" stroke="#1D8348" stroke-width="1.2"/>
  <text x="44" y="268" fill="#3DE07A" font-size="10" font-weight="bold">STREAM 02 • DYNAMIC WEARABLES (20 CH)</text>
  <text x="44" y="285" fill="#FFFFFF" font-size="12" font-weight="bold">12h Sliding Telemetry Window</text>
  <text x="44" y="302" fill="#75FFA5" font-size="10">• SpO2 (%), Resting HR, HRV (rMSSD)</text>
  <text x="44" y="317" fill="#75FFA5" font-size="10">• Respiratory Rate, Skin Temp, Steps</text>
  <text x="44" y="332" fill="#75FFA5" font-size="10">• Sleep Awakenings &amp; SABA Inhaler Puffs</text>
  <text x="44" y="347" fill="#75FFA5" font-size="10">• Cough, Wheeze, Dyspnea Scores (0-3)</text>
  <text x="44" y="361" fill="#5CFF95" font-size="9">Path: aasthma/dataset/data/dynamic/</text>

  <!-- Stream 3: Environmental AQI -->
  <rect x="34" y="382" width="247" height="104" fill="#04130A" stroke="#1D8348" stroke-width="1.2"/>
  <text x="44" y="400" fill="#3DE07A" font-size="10" font-weight="bold">STREAM 03 • ENVIRONMENT (CPCB / AQI)</text>
  <text x="44" y="417" fill="#FFFFFF" font-size="12" font-weight="bold">Ambient Pollution &amp; Weather</text>
  <text x="44" y="434" fill="#75FFA5" font-size="10">• Real-time PM2.5, PM10, AQI Index</text>
  <text x="44" y="449" fill="#75FFA5" font-size="10">• 70+ Indian CPCB Stations + Open-Meteo</text>
  <text x="44" y="464" fill="#75FFA5" font-size="10">• Replay Clock (t = 12h..239h)</text>
  <text x="44" y="479" fill="#5CFF95" font-size="9">Path: aasthma/simulation/clock.py</text>

  <!-- PostgreSQL Persistence -->
  <rect x="34" y="500" width="247" height="184" fill="#04130A" stroke="#4CFF8A" stroke-width="1.2"/>
  <text x="44" y="518" fill="#FFE14A" font-size="10" font-weight="bold">STORAGE • POSTGRESQL 16 + SQLALCHEMY</text>
  <text x="44" y="535" fill="#FFFFFF" font-size="12" font-weight="bold">Relational &amp; Telemetry Store</text>
  <text x="44" y="553" fill="#75FFA5" font-size="10">• patients &amp; patient_history tables</text>
  <text x="44" y="568" fill="#75FFA5" font-size="10">• timeseries_telemetry (indexed by hr)</text>
  <text x="44" y="583" fill="#75FFA5" font-size="10">• clinical_events &amp; severity labels</text>
  <text x="44" y="598" fill="#75FFA5" font-size="10">• patient_daily_logs (PRO check-ins)</text>
  <text x="44" y="613" fill="#75FFA5" font-size="10">• user_accounts (RBAC Doctor/Patient)</text>
  <text x="44" y="633" fill="#5CFF95" font-size="9">Path: aasthma/database/models.py</text>
  <text x="44" y="648" fill="#5CFF95" font-size="9">Path: aasthma/database/repository.py</text>
  <text x="44" y="663" fill="#3DE07A" font-size="9">Docker: postgres:16-alpine (:5432)</text>

  <!-- ======================================================================= -->
  <!-- COLUMN 2: HYBRID MECHANISTIC + AI/ML CORE (x=325..855)                  -->
  <!-- ======================================================================= -->
  <rect x="325" y="88" width="530" height="612" fill="#031008" stroke="#12612F" stroke-width="1.5"/>
  <rect x="325" y="88" width="530" height="28" fill="#061C0E" stroke="#12612F" stroke-width="1"/>
  <text x="337" y="106" fill="#4CFF8A" font-size="11" font-weight="bold">02. HYBRID DIGITAL TWIN CORE (MECHANISTIC ODE + 3-STAGE AI ENSEMBLE)</text>

  <!-- Stage 1A: Dilated TCN -->
  <rect x="342" y="130" width="240" height="145" fill="#04130A" stroke="#4CFF8A" stroke-width="1.2"/>
  <text x="352" y="148" fill="#4CFF8A" font-size="10" font-weight="bold">STAGE 1A • DEEP TEMPORAL MODEL</text>
  <text x="352" y="165" fill="#FFFFFF" font-size="12" font-weight="bold">Dilated TCN Fusion Network</text>
  <text x="352" y="182" fill="#75FFA5" font-size="10">• StaticMLPEncoder (60D → 64D)</text>
  <text x="352" y="197" fill="#75FFA5" font-size="10">• Conv1DDynamicEncoder (20x12h)</text>
  <text x="352" y="212" fill="#75FFA5" font-size="10">• 3 Dilated Conv1D (d = 1, 2, 4)</text>
  <text x="352" y="227" fill="#75FFA5" font-size="10">• Multi-Head: P(24h), P(48h), Sev(0-3)</text>
  <text x="352" y="246" fill="#FFE14A" font-size="9">Checkpoint: digital_twin_model.pt</text>
  <text x="352" y="261" fill="#5CFF95" font-size="9">aasthma/training/model1/tcn.py</text>

  <!-- Stage 1B: XGBoost Suite -->
  <rect x="598" y="130" width="240" height="145" fill="#04130A" stroke="#4CFF8A" stroke-width="1.2"/>
  <text x="608" y="148" fill="#4CFF8A" font-size="10" font-weight="bold">STAGE 1B • TABULAR TREE SUITE</text>
  <text x="608" y="165" fill="#FFFFFF" font-size="12" font-weight="bold">XGBoost Multi-Target Models</text>
  <text x="608" y="182" fill="#75FFA5" font-size="10">• Rolling Window Stats: mean, std,</text>
  <text x="608" y="197" fill="#75FFA5" font-size="10">  min, max, delta across 20 signals</text>
  <text x="608" y="212" fill="#75FFA5" font-size="10">• Lag Shifts (t-2 to t+2) + Static EHR</text>
  <text x="608" y="227" fill="#75FFA5" font-size="10">• Outputs: P(24h), P(48h), Sev(0-3)</text>
  <text x="608" y="246" fill="#FFE14A" font-size="9">Checkpoint: gb_digital_twin_models.pkl</text>
  <text x="608" y="261" fill="#5CFF95" font-size="9">aasthma/training/model2/</text>

  <!-- Stage 2: Stacking Meta-Learner -->
  <rect x="342" y="298" width="496" height="118" fill="#061C0E" stroke="#4CFF8A" stroke-width="1.6"/>
  <text x="354" y="317" fill="#FFE14A" font-size="10" font-weight="bold">STAGE 2 • STACKING META-LEARNER &amp; CONFORMAL CALIBRATION</text>
  <text x="354" y="335" fill="#FFFFFF" font-size="13" font-weight="bold">RespiTwinMLPMetaLearner (12D → 32D → 16D → 3 Heads) + SHAP Attributions</text>
  <text x="354" y="353" fill="#75FFA5" font-size="10">• Fuses 12 base probabilities: [tcn_24h, xgb_24h, tcn_48h, xgb_48h, tcn_sev_0..3, xgb_sev_0..3]</text>
  <text x="354" y="369" fill="#75FFA5" font-size="10">• Conformal 90% Risk Intervals + Personal Rolling Baseline Z-Score Attribution Drivers</text>
  <text x="354" y="385" fill="#4CFF8A" font-size="10" font-weight="bold">• Held-Out Test Metrics: 24h ROC-AUC = 0.9399 | 48h ROC-AUC = 0.9428 | Severity F1 = 0.8435</text>
  <text x="354" y="403" fill="#5CFF95" font-size="9">Path: aasthma/training/ensemble.py • aasthma/inference/inference_engine.py (meta_ensemble_model.pt)</text>

  <!-- Mechanistic ODE Simulator -->
  <rect x="342" y="436" width="496" height="122" fill="#04130A" stroke="#FFE14A" stroke-width="1.3"/>
  <text x="354" y="455" fill="#FFE14A" font-size="10" font-weight="bold">PHYSIOLOGICAL TWIN ENGINE • LATENT AIRWAY INFLAMMATION ODE</text>
  <text x="354" y="473" fill="#FFFFFF" font-size="12" font-weight="bold">dI/dt = -k·I(t) + a·Dose_PM(t) + b·Trigger(t) + δ_sys - c·η·Controller(t) + σ·ξ(t)</text>
  <text x="354" y="491" fill="#75FFA5" font-size="10">• Euler-Maruyama Integration (dt = 1.0h) estimating continuous mucosal inflammation state I(t) ∈ [0.05, 1.0]</text>
  <text x="354" y="507" fill="#75FFA5" font-size="10">• Counterfactual What-If Interventions: Stay Indoors, Wear N95 (95% filter), HEPA Purifier, ICS Step-Up</text>
  <text x="354" y="523" fill="#75FFA5" font-size="10">• Re-scores perturbed trajectories through Stage-1 &amp; Stage-2 neural ensemble in &lt; 65 ms</text>
  <text x="354" y="544" fill="#5CFF95" font-size="9">Path: aasthma/simulation/mechanistic_simulator.py • aasthma/simulation/clinical_data.py</text>

  <!-- Stage 3: Clinical Copilot & NLP Extractor -->
  <rect x="342" y="576" width="496" height="108" fill="#04130A" stroke="#1D8348" stroke-width="1.2"/>
  <text x="354" y="594" fill="#3DE07A" font-size="10" font-weight="bold">STAGE 3 • CLINICAL COPILOT &amp; NLP PATHOPHYSIOLOGY EXTRACTOR</text>
  <text x="354" y="611" fill="#FFFFFF" font-size="12" font-weight="bold">Schema-Validated LLM Copilot (GPT-4o / Hugging Face Llama-3.1 / Qwen2.5)</text>
  <text x="354" y="628" fill="#75FFA5" font-size="10">• Generates Pydantic-validated CopilotReport (precautions, triggers, breathing exercises, red flags)</text>
  <text x="354" y="643" fill="#75FFA5" font-size="10">• Clinical Note Extractor converts free-text notes (Typhoid, Dengue, Dehydration) into ODE &amp; vital deltas</text>
  <text x="354" y="658" fill="#FFE14A" font-size="9">• Safety Guardrail: Enforces non-prescriptive output; defers medication changes to treating clinician</text>
  <text x="354" y="674" fill="#5CFF95" font-size="9">Path: aasthma/llm/llm.py • aasthma/llm/clinical_extractor.py • aasthma/llm/prompt.md</text>

  <!-- ======================================================================= -->
  <!-- COLUMN 3: API GATEWAY & FRONTEND INTERFACES (x=880..1180)               -->
  <!-- ======================================================================= -->
  <rect x="880" y="88" width="300" height="612" fill="#031008" stroke="#12612F" stroke-width="1.5"/>
  <rect x="880" y="88" width="300" height="28" fill="#061C0E" stroke="#12612F" stroke-width="1"/>
  <text x="892" y="106" fill="#4CFF8A" font-size="11" font-weight="bold">03. FASTAPI &amp; NEXT.JS 16 INTERFACES</text>

  <!-- FastAPI Service Layer -->
  <rect x="894" y="130" width="272" height="135" fill="#04130A" stroke="#4CFF8A" stroke-width="1.2"/>
  <text x="904" y="148" fill="#3DE07A" font-size="10" font-weight="bold">BACKEND API • FASTAPI (PORT 8000)</text>
  <text x="904" y="165" fill="#FFFFFF" font-size="12" font-weight="bold">REST Service &amp; Replay Clock</text>
  <text x="904" y="182" fill="#75FFA5" font-size="10">• GET /api/patients &amp; /{id}</text>
  <text x="904" y="197" fill="#75FFA5" font-size="10">• POST /api/simulate/what-if</text>
  <text x="904" y="212" fill="#75FFA5" font-size="10">• POST /api/patients/{id}/adapt-note</text>
  <text x="904" y="227" fill="#75FFA5" font-size="10">• POST /api/patients/{id}/copilot-report</text>
  <text x="904" y="242" fill="#75FFA5" font-size="10">• POST /api/auth/login|signup|verify</text>
  <text x="904" y="257" fill="#5CFF95" font-size="9">Path: aasthma/server.py</text>

  <!-- Clinician Interface -->
  <rect x="894" y="282" width="272" height="225" fill="#04130A" stroke="#4CFF8A" stroke-width="1.4"/>
  <text x="904" y="300" fill="#FFE14A" font-size="10" font-weight="bold">PRIMARY UI • TREATING DOCTOR PORTAL</text>
  <text x="904" y="317" fill="#FFFFFF" font-size="12" font-weight="bold">Next.js 16 + React 19 + Three.js</text>
  <text x="904" y="335" fill="#75FFA5" font-size="10">• /patients: Cohort Risk Triage Table</text>
  <text x="904" y="351" fill="#75FFA5" font-size="10">• /patients/[id]: 3D GLB Lung &amp; GLSL</text>
  <text x="904" y="366" fill="#75FFA5" font-size="10">  Thermal Bronchial Inflammation View</text>
  <text x="904" y="382" fill="#75FFA5" font-size="10">• /patients/[id]/forecast: 24h &amp; 48h</text>
  <text x="904" y="397" fill="#75FFA5" font-size="10">  Conformal Fan Chart + SHAP + Copilot</text>
  <text x="904" y="413" fill="#75FFA5" font-size="10">• /patients/[id]/what-if: Interactive</text>
  <text x="904" y="428" fill="#75FFA5" font-size="10">  Counterfactual Intervention Sandbox</text>
  <text x="904" y="444" fill="#75FFA5" font-size="10">• /patients/[id]/adaptation: Clinical</text>
  <text x="904" y="459" fill="#75FFA5" font-size="10">  Note Perturbation &amp; Patient Enrollment</text>
  <text x="904" y="475" fill="#75FFA5" font-size="10">• /benchmarks &amp; /assumptions: Audit</text>
  <text x="904" y="495" fill="#5CFF95" font-size="9">Path: frontend/app/ &amp; frontend/components/</text>

  <!-- Patient Portal -->
  <rect x="894" y="524" width="272" height="160" fill="#04130A" stroke="#1D8348" stroke-width="1.2"/>
  <text x="904" y="542" fill="#3DE07A" font-size="10" font-weight="bold">SECONDARY UI • PATIENT PORTAL</text>
  <text x="904" y="559" fill="#FFFFFF" font-size="12" font-weight="bold">Personal Asthma Companion</text>
  <text x="904" y="577" fill="#75FFA5" font-size="10">• Plain-Language 24h/48h Risk Guidance</text>
  <text x="904" y="593" fill="#75FFA5" font-size="10">• Local Station AQI &amp; Mask Advisories</text>
  <text x="904" y="609" fill="#75FFA5" font-size="10">• Daily Symptom &amp; Inhaler Log Entry</text>
  <text x="904" y="625" fill="#75FFA5" font-size="10">• Grounded Patient Copilot Chat</text>
  <text x="904" y="641" fill="#75FFA5" font-size="10">• Role-Isolated Access (PT-8821, etc.)</text>
  <text x="904" y="665" fill="#5CFF95" font-size="9">Path: frontend/app/patient-portal/</text>

  <!-- ======================================================================= -->
  <!-- CONNECTING ARROWS                                                       -->
  <!-- ======================================================================= -->
  <!-- Stream 1, 2, 3 -> Stage 1 Models -->
  <line x1="281" y1="180" x2="338" y2="180" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>
  <line x1="281" y1="305" x2="338" y2="230" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>
  <line x1="281" y1="430" x2="338" y2="475" stroke="#FFE14A" stroke-width="2" marker-end="url(#arrowYellow)"/>
  <line x1="281" y1="575" x2="338" y2="615" stroke="#5CFF95" stroke-width="1.8" marker-end="url(#arrowCyan)"/>

  <!-- Stage 1A & 1B -> Stage 2 Meta-Learner -->
  <line x1="462" y1="275" x2="462" y2="294" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>
  <line x1="718" y1="275" x2="718" y2="294" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>

  <!-- Mechanistic ODE <-> Stage 2 Meta-Learner -->
  <line x1="590" y1="436" x2="590" y2="418" stroke="#FFE14A" stroke-width="2" marker-end="url(#arrowYellow)"/>
  <line x1="610" y1="416" x2="610" y2="434" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>

  <!-- Stage 2 -> Stage 3 Copilot -->
  <line x1="590" y1="558" x2="590" y2="574" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>

  <!-- Core -> FastAPI & Frontends -->
  <line x1="838" y1="355" x2="890" y2="205" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>
  <line x1="838" y1="495" x2="890" y2="415" stroke="#FFE14A" stroke-width="2" marker-end="url(#arrowYellow)"/>
  <line x1="838" y1="625" x2="890" y2="595" stroke="#5CFF95" stroke-width="2" marker-end="url(#arrowCyan)"/>
  <line x1="1030" y1="265" x2="1030" y2="280" stroke="#4CFF8A" stroke-width="2" marker-end="url(#arrowGreen)"/>
</svg>
"""


def write_svg():
    for target in [PUBLIC_DIR / "architecture-diagram.svg", DOCS_DIR / "Architecture_Diagram.svg"]:
        target.write_text(SVG_CONTENT, encoding="utf-8")
        print(f"Wrote {target}")


def draw_box(c, x, y, w, h, title, subtitle, bullets, footer, border_color=colors.HexColor("#4CFF8A"), bg_color=colors.HexColor("#04130A")):
    c.setFillColor(bg_color)
    c.setStrokeColor(border_color)
    c.setLineWidth(1.2)
    c.rect(x, y, w, h, fill=1, stroke=1)

    top_y = y + h - 14
    c.setFillColor(colors.HexColor("#3DE07A"))
    c.setFont("Courier-Bold", 7.5)
    c.drawString(x + 8, top_y, title)

    c.setFillColor(colors.HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x + 8, top_y - 13, subtitle)

    cur_y = top_y - 26
    c.setFillColor(colors.HexColor("#75FFA5"))
    c.setFont("Helvetica", 7.8)
    for b in bullets:
        c.drawString(x + 8, cur_y, b)
        cur_y -= 11

    if footer:
        c.setFillColor(colors.HexColor("#FFE14A"))
        c.setFont("Courier", 7)
        c.drawString(x + 8, y + 6, footer)


def build_architecture_pdf(pdf_path: Path):
    w, h = landscape(A4)  # 841.89 x 595.27
    c = canvas.Canvas(str(pdf_path), pagesize=landscape(A4))
    c.setTitle("BreathTwin (DigitalTwin) - System and Codebase Architecture Diagram")

    # Background
    c.setFillColor(colors.HexColor("#020A05"))
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Header
    c.setFillColor(colors.HexColor("#04130A"))
    c.setStrokeColor(colors.HexColor("#12612F"))
    c.rect(18, h - 56, w - 36, 40, fill=1, stroke=1)

    c.setFillColor(colors.HexColor("#4CFF8A"))
    c.setFont("Courier-Bold", 12)
    c.drawString(28, h - 34, "BREATHTWIN (DIGITALTWIN) // SYSTEM & CODEBASE ARCHITECTURE DIAGRAM")

    c.setFillColor(colors.HexColor("#75FFA5"))
    c.setFont("Helvetica", 8.5)
    c.drawString(28, h - 48, "Three-Stream Data Fusion  |  Mechanistic Airway ODE Simulator  |  Stacked Dilated-TCN + XGBoost + MLP Ensemble  |  FastAPI & Next.js 16")

    c.setFillColor(colors.HexColor("#FFE14A"))
    c.setFont("Courier-Bold", 8.5)
    c.drawRightString(w - 28, h - 34, "HELD-OUT TEST ROC-AUC: 24H = 0.9399 | 48H = 0.9428")

    # Column 1: Data Streams & PostgreSQL (x=18, width=215)
    col1_x, col1_w = 18, 215
    draw_box(
        c, col1_x, h - 180, col1_w, 112,
        "STREAM 01 - STATIC EHR (60 FEATURES)",
        "Patient Clinical Baseline",
        [
            "- Demographics, BMI, Smoking Pack-Years",
            "- Spirometry: FEV1%, FEV1/FVC, PEF",
            "- ICS Controller Regimen & Adherence",
            "- Prior Exacerbations & ICU History",
        ],
        "Path: aasthma/dataset/data/static/"
    )
    draw_box(
        c, col1_x, h - 305, col1_w, 115,
        "STREAM 02 - WEARABLE TELEMETRY (20 CH)",
        "12-Hour Sliding Sensor Window",
        [
            "- SpO2 (%), Resting HR, HRV (rMSSD)",
            "- Respiratory Rate, Skin Temp, Steps",
            "- Sleep Awakenings & SABA Inhaler Puffs",
            "- Cough, Wheeze, Dyspnea Scores (0-3)",
        ],
        "Path: aasthma/dataset/data/dynamic/"
    )
    draw_box(
        c, col1_x, h - 420, col1_w, 105,
        "STREAM 03 - ENVIRONMENT (CPCB / AQI)",
        "Ambient Air Quality & Weather",
        [
            "- Hourly PM2.5, PM10, AQI Index",
            "- 70+ Indian Monitoring Stations",
            "- Simulation Replay Clock (t=12..239h)",
        ],
        "Path: aasthma/simulation/clock.py"
    )
    draw_box(
        c, col1_x, 22, col1_w, 142,
        "STORAGE - POSTGRESQL 16 + SQLALCHEMY",
        "Relational & Telemetry Persistence",
        [
            "- patients & patient_history tables",
            "- timeseries_telemetry (indexed by hour)",
            "- clinical_events & severity grades",
            "- patient_daily_logs (PRO check-ins)",
            "- user_accounts (Doctor & Patient RBAC)",
        ],
        "Path: aasthma/database/models.py",
        border_color=colors.HexColor("#FFE14A")
    )

    # Column 2: Hybrid Twin Core (x=255, width=335)
    col2_x, col2_w = 255, 335
    draw_box(
        c, col2_x, h - 195, 162, 127,
        "STAGE 1A - DEEP TEMPORAL",
        "Dilated TCN Network",
        [
            "- StaticMLPEncoder (60->64D)",
            "- Conv1DDynamicEncoder (20x12h)",
            "- Dilated Conv1D (d=1, 2, 4)",
            "- Heads: P(24h), P(48h), Sev",
        ],
        "model1/digital_twin_model.pt"
    )
    draw_box(
        c, col2_x + 173, h - 195, 162, 127,
        "STAGE 1B - BOOSTED TREES",
        "XGBoost Multi-Target",
        [
            "- Rolling mean, std, min, max",
            "- Temporal lag shifts (t-2..t+2)",
            "- Static EHR fusion vector",
            "- Heads: P(24h), P(48h), Sev",
        ],
        "model2/gb_digital_twin_models.pkl"
    )
    draw_box(
        c, col2_x, h - 320, col2_w, 114,
        "STAGE 2 - STACKING META-LEARNER & CONFORMAL CALIBRATION",
        "RespiTwinMLPMetaLearner (12D -> 32D -> 16D -> 3 Heads)",
        [
            "- Fuses 12 base probabilities from Stage-1 TCN & XGBoost",
            "- Computes 90% Conformal Risk Intervals + SHAP Attributions",
            "- Held-Out Test ROC-AUC: 24h = 0.9399 | 48h = 0.9428 | F1 = 0.8435",
        ],
        "Path: aasthma/training/ensemble.py | aasthma/inference/inference_engine.py",
        bg_color=colors.HexColor("#061C0E")
    )
    draw_box(
        c, col2_x, h - 445, col2_w, 114,
        "MECHANISTIC TWIN SIMULATOR - LATENT AIRWAY ODE",
        "dI/dt = -k*I + a*Dose_PM(t) + b*Trigger(t) + d_sys - c*Controller(t)",
        [
            "- Euler-Maruyama ODE integration (dt = 1.0h) for inflammation I(t)",
            "- Counterfactual What-If: Indoors, N95 (95% filter), HEPA, ICS Step-Up",
            "- Re-scores counterfactual trajectories through neural stack (<65 ms)",
        ],
        "Path: aasthma/simulation/mechanistic_simulator.py",
        border_color=colors.HexColor("#FFE14A")
    )
    draw_box(
        c, col2_x, 22, col2_w, 118,
        "STAGE 3 - CLINICAL COPILOT & NLP NOTE EXTRACTOR",
        "Pydantic-Validated LLM Copilot (GPT-4o / HF Llama-3.1 / Qwen2.5)",
        [
            "- Generates structured CopilotReport (precautions, triggers, red flags)",
            "- Extracts free-text clinical notes (Typhoid, Dengue) into ODE deltas",
            "- Non-prescriptive safety guardrail: clinician retains medication control",
        ],
        "Path: aasthma/llm/llm.py | aasthma/llm/clinical_extractor.py"
    )

    # Column 3: API & Frontend (x=612, width=212)
    col3_x, col3_w = 612, 212
    draw_box(
        c, col3_x, h - 195, col3_w, 127,
        "BACKEND API - FASTAPI (:8000)",
        "REST Gateway & Replay Clock",
        [
            "- GET /api/patients & /{id}",
            "- POST /api/simulate/what-if",
            "- POST /api/patients/{id}/adapt-note",
            "- POST /api/patients/{id}/copilot-report",
            "- POST /api/auth/login|signup|verify",
        ],
        "Path: aasthma/server.py"
    )
    draw_box(
        c, col3_x, h - 395, col3_w, 188,
        "DOCTOR UI - NEXT.JS 16 + THREE.JS",
        "Clinician Triage & Twin Viewport",
        [
            "- /patients: Cohort Risk Triage",
            "- /patients/[id]: 3D GLB Lung &",
            "  GLSL Thermal Inflammation View",
            "- /patients/[id]/forecast: 24h/48h",
            "  Conformal Fan Chart & Copilot",
            "- /patients/[id]/what-if: Sandbox",
            "- /patients/[id]/adaptation: Notes",
            "- /benchmarks & /assumptions",
        ],
        "Path: frontend/app/ & components/",
        border_color=colors.HexColor("#FFE14A")
    )
    draw_box(
        c, col3_x, 22, col3_w, 166,
        "PATIENT UI - PORTAL (:3000)",
        "Personal Asthma Companion",
        [
            "- Role-isolated patient login",
            "- Plain-language 24h/48h risk card",
            "- Local CPCB station AQI advisory",
            "- Daily symptom & SABA puff log",
            "- Grounded AI patient copilot chat",
        ],
        "Path: frontend/app/patient-portal/"
    )

    # Draw connector lines
    c.setStrokeColor(colors.HexColor("#4CFF8A"))
    c.setLineWidth(1.5)
    c.line(col1_x + col1_w, h - 125, col2_x, h - 125)
    c.line(col1_x + col1_w, h - 245, col2_x, h - 165)
    c.line(col1_x + col1_w, h - 365, col2_x, h - 385)
    c.line(col2_x + col2_w, h - 260, col3_x, h - 135)
    c.line(col2_x + col2_w, h - 385, col3_x, h - 300)
    c.line(col2_x + col2_w, 80, col3_x, 105)

    c.showPage()
    c.save()
    print(f"Wrote {pdf_path}")


def build_presentation_pdf(pdf_path: Path):
    w, h = landscape(A4)
    c = canvas.Canvas(str(pdf_path), pagesize=landscape(A4))
    c.setTitle("BreathTwin (DigitalTwin) - Project Details and Outcomes Presentation")

    slides = [
        {
            "tag": "SLIDE 01 // EXECUTIVE OVERVIEW",
            "title": "BreathTwin: Multimodal Asthma Flare-Up Digital Twin",
            "subtitle": "Forecasting Acute Asthma Exacerbations 24 to 48 Hours Ahead in High-Pollution Indian Cities",
            "blocks": [
                ("PROJECT SUMMARY", [
                    "BreathTwin fuses longitudinal Electronic Health Records (EHR), 20-channel continuous wearable telemetry,",
                    "and real-time Central Pollution Control Board (CPCB) air quality data into a patient-specific Digital Twin.",
                    "A mechanistic latent airway inflammation ODE coupled with a 3-stage neural-tree ensemble predicts",
                    "24-hour and 48-hour exacerbation risk, explains the physiological drivers, and simulates counterfactual",
                    "interventions before a clinician advises the patient.",
                ]),
                ("TEAM & SUBMISSION COMPLIANCE", [
                    "Submission Project: BreathTwin  |  Identifier: ABAY_LNMIIT/NSUT  |  Inter-College Engineering Team",
                    "Team Lead, AI, Full-Stack & Backend: Aarush Bhattacharjee / Frisbee148 (LNMIIT)",
                    "Machine Learning Engineer: Rakshit Gupta / Hobbiskar21 (NSUT - All ML Responsibilities)",
                    "Domain: Pulmonary Informatics & Digital Twins  |  License: MIT Open-Source License",
                ]),
            ],
        },
        {
            "tag": "SLIDE 02 // PROBLEM STATEMENT & HEALTHCARE USE CASE",
            "title": "Closing the 24-36 Hour Sub-Clinical Inflammatory Blindspot",
            "subtitle": "Shifting Asthma Care from Reactive Emergency Visits to Proactive Pre-Symptomatic Triage",
            "blocks": [
                ("THE CLINICAL PROBLEM", [
                    "1. High Mortality Burden: India accounts for >42% of global asthma deaths (~13% of global prevalence).",
                    "2. Invisible Deterioration: Routine pulmonology visits occur months apart. Acute PM2.5 smog surges trigger",
                    "   bronchial mucosal swelling and smooth-muscle constriction 24 to 36 hours before the patient perceives dyspnea.",
                    "3. Fragmented Signals: Static spirometry, wearable sensors, and tomorrow's AQI exist in isolated silos.",
                ]),
                ("HEALTHCARE USE CASE (DOCTOR & PATIENT WORKFLOWS)", [
                    "1. Cohort Triage: Pulmonologist opens the ranked patient list sorted by 48-hour exacerbation risk.",
                    "2. Explainable Inspection: Doctor inspects 90% conformal risk intervals, SHAP attributions, and 3D lung state.",
                    "3. Counterfactual What-If Testing: Doctor tests 'Stay Indoors', 'Wear N95 Mask', 'HEPA Filter', or",
                    "   'ICS Controller Adherence Step-Up' on the patient's digital twin to quantify risk reduction prior to care.",
                    "4. Patient Companion Portal: Patient logs daily symptoms/inhaler use and accesses clinician-verified Copilot Reports.",
                ]),
            ],
        },
        {
            "tag": "SLIDE 03 // AI/ML & DYNAMIC RETRAINING ARCHITECTURE",
            "title": "Hybrid Multimodal Ensemble + Continual LLM Adaptation",
            "subtitle": "Combining Physiological ODEs with Dilated TCN, XGBoost, and EWC Continual Model Retraining",
            "blocks": [
                ("STAGE 1 & STAGE 2 PREDICTIVE ENSEMBLE", [
                    "Stage 1A - Dilated TCN (DigitalTwinFusionModel): StaticMLPEncoder (60 EHR features -> 64D) +",
                    "   Conv1DDynamicEncoder (3 dilated 1D conv blocks, d=1,2,4 over 20x12h telemetry -> 128D).",
                    "Stage 1B - XGBoost Multi-Target Suite: Rolling window statistics (mean, std, min, max, delta) + lag shifts.",
                    "Stage 2 - Stacking Meta-Learner (RespiTwinMLPMetaLearner): PyTorch MLP (12D -> 32D -> 16D) combining",
                    "   Stage-1 probabilities into calibrated 24h risk, 48h risk, and 4-class exacerbation severity (Grade 0-3).",
                ]),
                ("DYNAMIC FEATURE EXTRACTION & CONTINUAL RETRAINING", [
                    "Mechanistic ODE Airway Simulator: dI/dt = -k*I + a*Dose_PM(t) + b*Trigger(t) + d_sys - c*Controller(t)",
                    "Stage 3 LLM Clinical Note Extractor: Converts free-text notes (Typhoid, Dengue, Dehydration) into ODE modifiers.",
                    "Continual Retraining with EWC: Doctor-verified outliers in PostgreSQL Replay Buffer trigger Meta-Learner",
                    "   fine-tuning regularized with Elastic Weight Consolidation (EWC) to preserve base model stability.",
                ]),
            ],
        },
        {
            "tag": "SLIDE 04 // EXPERIMENTAL OUTCOMES & BENCHMARKS",
            "title": "Validation Results, Ablation Studies, and Operational Safety",
            "subtitle": "Evaluated on Held-Out Synthetic Cohort Split by Patient (800 Train / 100 Val / 100 Test)",
            "blocks": [
                ("HELD-OUT TEST METRICS & BENCHMARK COMPARISON", [
                    "Stacked Meta-Learner (TCN + XGBoost + MLP): 24h ROC-AUC = 0.9399 | 48h ROC-AUC = 0.9428 | Severity F1 = 0.8435",
                    "24h Precision @ 0.50 = 0.8560 | 24h Recall @ 0.50 = 0.7281 | Mean Warning Lead Time = 42.4 +/- 4.1 hours",
                    "BreathTwin Hybrid vs Baselines: Outperforms XGBoost-only (PR-AUC 0.614, Lead 18.6h) and LSTM (PR-AUC 0.671, Lead 22.1h)",
                    "End-to-End Counterfactual Inference Latency: < 65 ms per 48-hour trajectory simulation.",
                ]),
                ("ETHICAL GUARDRAILS & OPERATIONAL BOUNDARIES", [
                    "1. Synthetic Data Only: Zero real patient PII/PHI; designed in alignment with DPDP Act data minimization.",
                    "2. Decision Support, Not Diagnosis: Estimates exacerbation risk to assist triage; never issues prescriptions.",
                    "3. Reproducible Open-Source Stack: Docker Compose PostgreSQL 16 + FastAPI + Next.js 16 under MIT License.",
                ]),
            ],
        },
    ]

    for idx, slide in enumerate(slides, start=1):
        c.setFillColor(colors.HexColor("#020A05"))
        c.rect(0, 0, w, h, fill=1, stroke=0)

        # Outer border
        c.setStrokeColor(colors.HexColor("#12612F"))
        c.setLineWidth(1.5)
        c.rect(20, 20, w - 40, h - 40, fill=0, stroke=1)

        # Header
        c.setFillColor(colors.HexColor("#04130A"))
        c.rect(20, h - 96, w - 40, 76, fill=1, stroke=1)

        c.setFillColor(colors.HexColor("#4CFF8A"))
        c.setFont("Courier-Bold", 10)
        c.drawString(36, h - 44, slide["tag"])
        c.drawRightString(w - 36, h - 44, f"PAGE 0{idx} / 04")

        c.setFillColor(colors.HexColor("#FFFFFF"))
        c.setFont("Helvetica-Bold", 18)
        c.drawString(36, h - 68, slide["title"])

        c.setFillColor(colors.HexColor("#75FFA5"))
        c.setFont("Helvetica", 10.5)
        c.drawString(36, h - 85, slide["subtitle"])

        # Content blocks
        curr_y = h - 125
        for block_title, lines in slide["blocks"]:
            box_h = 36 + len(lines) * 20
            c.setFillColor(colors.HexColor("#04130A"))
            c.setStrokeColor(colors.HexColor("#4CFF8A"))
            c.rect(36, curr_y - box_h, w - 72, box_h, fill=1, stroke=1)

            c.setFillColor(colors.HexColor("#FFE14A"))
            c.setFont("Courier-Bold", 10.5)
            c.drawString(52, curr_y - 22, f"// {block_title}")

            c.setFillColor(colors.HexColor("#FFFFFF"))
            c.setFont("Helvetica", 10.5)
            ty = curr_y - 44
            for line in lines:
                c.drawString(52, ty, line)
                ty -= 20

            curr_y = curr_y - box_h - 22

        # Footer
        c.setFillColor(colors.HexColor("#3DE07A"))
        c.setFont("Courier", 8.5)
        c.drawString(36, 32, "BREATHTWIN (DIGITALTWIN)  |  OPEN-SOURCE MIT LICENSE  |  PUBLIC REPOSITORY ARTIFACT")
        c.showPage()

    c.save()
    print(f"Wrote {pdf_path}")


if __name__ == "__main__":
    write_svg()
    for target in [DOCS_DIR / "Architecture_Diagram.pdf", PUBLIC_DOCS_DIR / "Architecture_Diagram.pdf"]:
        build_architecture_pdf(target)
    for target in [DOCS_DIR / "Project_Presentation.pdf", PUBLIC_DOCS_DIR / "Project_Presentation.pdf"]:
        build_presentation_pdf(target)
