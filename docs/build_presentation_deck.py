#!/usr/bin/env python3
"""
Generate comprehensive, high-resolution BreathTwin presentation in PPTX and PDF format.
Uses python-pptx for native PowerPoint creation, and ReportLab for universal,
glitch-free PDF generation that opens reliably on all PDF readers without white screen bugs.
"""

import os
import shutil
import subprocess
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

from reportlab.lib import colors
from reportlab.pdfgen import canvas

# Directories
ROOT = Path("/home/casp1an/Code/DigiTwin")
DOCS_DIR = ROOT / "docs"
SCREENSHOTS_DIR = DOCS_DIR / "screenshots"
PUBLIC_DOCS_DIR = ROOT / "frontend" / "public" / "docs"
HIGHRES_DIR = DOCS_DIR / "highres_slides"

DOCS_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DOCS_DIR.mkdir(parents=True, exist_ok=True)
HIGHRES_DIR.mkdir(parents=True, exist_ok=True)

# Color Palette (Tactical High-Tech Medical Theme)
BG_DARK = RGBColor(2, 10, 5)        # Deepest dark green-black
CARD_BG = RGBColor(5, 20, 11)       # Subtle card background
CARD_BORDER = RGBColor(22, 90, 44)  # Muted green border
HEADER_BG = RGBColor(4, 16, 9)      # Header banner bg
ACCENT_GREEN = RGBColor(76, 255, 138)  # Bright neon green (#4CFF8A)
ACCENT_GOLD = RGBColor(255, 225, 74)   # Warning gold/amber (#FFE14A)
ACCENT_CYAN = RGBColor(92, 255, 230)   # Cyan / telemetry (#5CFFE6)
ACCENT_RED = RGBColor(255, 85, 85)     # Alert red
TEXT_WHITE = RGBColor(255, 255, 255)   # Primary text
TEXT_MINT = RGBColor(140, 240, 175)    # Secondary description
TEXT_MUTED = RGBColor(160, 185, 170)   # Body details
TEXT_DIM = RGBColor(110, 135, 120)     # Footer/captions

TOTAL_SLIDES = 18

# Text repository for searchable PDF layer
SLIDE_TEXT_CORPUS = {}


def set_slide_base(slide, prs, tag: str, title: str, subtitle: str, page_num: int):
    """Draw common background, header banner, title, subtitle, and footer."""
    # Set actual slide background property
    try:
        bg_fill = slide.background.fill
        bg_fill.solid()
        bg_fill.fore_color.rgb = BG_DARK
    except Exception:
        pass

    # Full background rectangle
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), prs.slide_width, prs.slide_height)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG_DARK
    bg.line.fill.background()

    # Outer neon border frame
    frame = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.25), Inches(0.25),
        prs.slide_width - Inches(0.5), prs.slide_height - Inches(0.5)
    )
    frame.fill.background()
    frame.line.color.rgb = CARD_BORDER
    frame.line.width = Pt(1.5)

    # Header Box
    h_box = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.4), Inches(0.38),
        prs.slide_width - Inches(0.8), Inches(1.08)
    )
    h_box.fill.solid()
    h_box.fill.fore_color.rgb = HEADER_BG
    h_box.line.color.rgb = CARD_BORDER
    h_box.line.width = Pt(1)

    # Header Text
    tf = h_box.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.2)
    tf.margin_top = Inches(0.1)
    tf.margin_right = Inches(0.2)
    tf.margin_bottom = Inches(0.05)

    p0 = tf.paragraphs[0]
    p0.text = tag
    p0.font.name = "Consolas"
    p0.font.size = Pt(9.5)
    p0.font.bold = True
    p0.font.color.rgb = ACCENT_GREEN

    p1 = tf.add_paragraph()
    p1.text = title
    p1.font.name = "Calibri"
    p1.font.size = Pt(18)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE

    p2 = tf.add_paragraph()
    p2.text = subtitle
    p2.font.name = "Calibri"
    p2.font.size = Pt(10.5)
    p2.font.color.rgb = TEXT_MINT

    # Footer Box
    f_box = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.4), prs.slide_height - Inches(0.55),
        prs.slide_width - Inches(0.8), Inches(0.28)
    )
    f_box.fill.solid()
    f_box.fill.fore_color.rgb = HEADER_BG
    f_box.line.color.rgb = CARD_BORDER
    f_box.line.width = Pt(0.75)

    ftf = f_box.text_frame
    ftf.word_wrap = False
    ftf.margin_left = Inches(0.15)
    ftf.margin_top = Inches(0.05)
    ftf.margin_right = Inches(0.15)
    ftf.margin_bottom = Inches(0.05)
    
    fp = ftf.paragraphs[0]
    fp.text = "BREATHTWIN // MULTIMODAL ASTHMA DIGITAL TWIN  |  ABAY_LNMIIT/NSUT  |  MIT OPEN-SOURCE LICENSE"
    fp.font.name = "Consolas"
    fp.font.size = Pt(8)
    fp.font.color.rgb = TEXT_DIM

    # Page number pill
    pn_box = slide.shapes.add_textbox(
        prs.slide_width - Inches(2.2), prs.slide_height - Inches(0.55),
        Inches(1.6), Inches(0.28)
    )
    ptf = pn_box.text_frame
    ptf.margin_top = Inches(0.05)
    pp = ptf.paragraphs[0]
    pp.alignment = PP_ALIGN.RIGHT
    pp.text = f"SLIDE {page_num:02d} / {TOTAL_SLIDES:02d}"
    pp.font.name = "Consolas"
    pp.font.size = Pt(8.5)
    pp.font.bold = True
    pp.font.color.rgb = ACCENT_GOLD

    SLIDE_TEXT_CORPUS.setdefault(page_num, []).extend([tag, title, subtitle])


def add_card(slide, left, top, width, height, title: str, bullets: list, title_color=ACCENT_GOLD, border_color=CARD_BORDER, page_num=1):
    """Add a structured card with title and list of bullet points."""
    card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = CARD_BG
    card.line.color.rgb = border_color
    card.line.width = Pt(1.2)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.18)
    tf.margin_top = Inches(0.14)
    tf.margin_right = Inches(0.18)
    tf.margin_bottom = Inches(0.14)

    if title:
        p0 = tf.paragraphs[0]
        p0.text = f"// {title.upper()}"
        p0.font.name = "Consolas"
        p0.font.size = Pt(10)
        p0.font.bold = True
        p0.font.color.rgb = title_color
        p0.space_after = Pt(6)
        first_bullet = True
        SLIDE_TEXT_CORPUS.setdefault(page_num, []).append(title)
    else:
        first_bullet = False

    for item in bullets:
        if isinstance(item, tuple):
            header_text, body_text = item
            p = tf.add_paragraph() if (first_bullet or title) else tf.paragraphs[0]
            first_bullet = True
            p.text = f"• {header_text}: "
            p.font.name = "Calibri"
            p.font.size = Pt(10)
            p.font.bold = True
            p.font.color.rgb = TEXT_WHITE
            
            run = p.add_run()
            run.text = body_text
            run.font.bold = False
            run.font.color.rgb = TEXT_MINT
            p.space_after = Pt(4)
            SLIDE_TEXT_CORPUS.setdefault(page_num, []).append(f"{header_text}: {body_text}")
        else:
            p = tf.add_paragraph() if (first_bullet or title) else tf.paragraphs[0]
            first_bullet = True
            p.text = f"• {item}"
            p.font.name = "Calibri"
            p.font.size = Pt(9.8)
            p.font.color.rgb = TEXT_MUTED
            p.space_after = Pt(3.5)
            SLIDE_TEXT_CORPUS.setdefault(page_num, []).append(str(item))

    return card


def add_image_panel(slide, img_path: Path, left, top, width, height, caption: str = None, page_num=1):
    """Add an image with a surrounding high-tech frame and optional caption."""
    frame = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    frame.fill.solid()
    frame.fill.fore_color.rgb = RGBColor(0, 5, 2)
    frame.line.color.rgb = CARD_BORDER
    frame.line.width = Pt(1.5)

    pad = Inches(0.06)
    cap_space = Inches(0.3) if caption else Inches(0)
    img_h = height - (pad * 2) - cap_space
    img_w = width - (pad * 2)

    if img_path.exists():
        slide.shapes.add_picture(str(img_path), left + pad, top + pad, img_w, img_h)

    if caption:
        cap_box = slide.shapes.add_textbox(left + pad, top + height - cap_space - pad, img_w, cap_space)
        ctf = cap_box.text_frame
        ctf.margin_left = Inches(0.05)
        ctf.margin_top = Inches(0.04)
        cp = ctf.paragraphs[0]
        cp.text = f"[INTERFACE SCREENSHOT]  {caption}"
        cp.font.name = "Consolas"
        cp.font.size = Pt(8.5)
        cp.font.bold = True
        cp.font.color.rgb = ACCENT_GREEN
        SLIDE_TEXT_CORPUS.setdefault(page_num, []).append(caption)


def build_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # =========================================================================
    # SLIDE 01: TITLE & EXECUTIVE OVERVIEW
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_base(s1, prs, "PROJECT OVERVIEW // INTER-COLLEGE SUBMISSION",
                   "BreathTwin: Multimodal Asthma Flare-Up Digital Twin",
                   "Forecasting Acute Asthma Exacerbations 24 to 48 Hours Ahead in High-Pollution Indian Metros", 1)

    add_card(s1, Inches(0.4), Inches(1.6), Inches(6.0), Inches(5.1),
             "EXECUTIVE SUMMARY & SYSTEM SCOPE", [
                 ("Core Innovation", "Constructs a personalized physiological Digital Twin fusing longitudinal Electronic Health Records, 20-channel wearable biometric telemetry, and real-time CPCB air quality indices."),
                 ("Biophysical ODE Simulator", "Integrates latent bronchial inflammation trajectory I(t) using an Euler-Maruyama stochastic differential equation."),
                 ("3-Stage Ensemble Architecture", "Stacked Dilated Temporal Convolutional Network (TCN) + XGBoost Multi-Target Tree Suite + PyTorch MLP Meta-Learner."),
                 ("Early Warning Horizon", "Predicts acute exacerbation risk 24 to 48 hours in advance, achieving ROC-AUC of 0.940 (24h) and 0.943 (48h) on held-out test cohort."),
                 ("Interactive Counterfactual Sandbox", "Allows pulmonologists to simulate N95 respirators, indoor staying, HEPA purifiers, and ICS controller step-ups in < 65 ms before clinical advice."),
                 ("Dual Clinical Portals", "Specialized WebGL/Three.js 3D viewport for treating doctors and accessible plain-language mobile companion for asthma patients."),
             ], title_color=ACCENT_GREEN, page_num=1)

    add_card(s1, Inches(6.6), Inches(1.6), Inches(6.33), Inches(2.7),
             "TEAM COMPOSITION & SUBMISSION IDENTIFIERS", [
                 ("Submission Identifier", "ABAY_LNMIIT/NSUT  (Inter-College Collaborative Engineering Team)"),
                 ("Team Lead & Backend Architect", "Aarush Bhattacharjee / Frisbee148 (LNMIIT, Jaipur) — System Architecture, Full-Stack, FastAPI, Three.js 3D Lung, Mechanistic ODE, Copilot"),
                 ("Machine Learning Engineer", "Rakshit Gupta / Hobbiskar21 (NSUT, New Delhi) — ML Responsibilities, Stage-1A TCN, Stage-1B XGBoost, Stage-2 Meta-Learner, Conformal Calibration"),
                 ("Licensing & Integrity", "MIT Open-Source License • Zero Real Patient PHI/PII (100% Synthetic Cohort)"),
                 ("Repository Access", "https://github.com/Frisbee148/DigitalTwin (Publicly Accessible Artifacts)"),
             ], title_color=ACCENT_GOLD, page_num=1)

    metrics_box = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(6.6), Inches(4.5), Inches(6.33), Inches(2.2))
    metrics_box.fill.solid()
    metrics_box.fill.fore_color.rgb = CARD_BG
    metrics_box.line.color.rgb = ACCENT_GREEN
    metrics_box.line.width = Pt(1.2)

    mtf = metrics_box.text_frame
    mtf.word_wrap = True
    mtf.margin_top = Inches(0.12)
    mtf.margin_left = Inches(0.2)
    mp0 = mtf.paragraphs[0]
    mp0.text = "// HELD-OUT VALIDATION METRICS & OPERATIONAL TARGETS"
    mp0.font.name = "Consolas"
    mp0.font.size = Pt(10)
    mp0.font.bold = True
    mp0.font.color.rgb = ACCENT_GREEN

    metrics = [
        "• 24-Hour Exacerbation ROC-AUC: 0.9399 (Held-out 100-patient test split)",
        "• 48-Hour Severe Flare-Up ROC-AUC: 0.9428 (42.4 ± 4.1h warning lead time)",
        "• 4-Grade Severity Weighted F1: 0.8435 (Grades 0-3 triage classification)",
        "• Counterfactual Simulation Latency: < 65 ms (Interactive ODE re-scoring)",
        "• False Alarm Frequency: 0.7 alarms / week (Clinical Target: ≤ 1.0 / wk)",
    ]
    for m in metrics:
        p = mtf.add_paragraph()
        p.text = m
        p.font.name = "Calibri"
        p.font.size = Pt(10)
        p.font.color.rgb = TEXT_WHITE
        SLIDE_TEXT_CORPUS.setdefault(1, []).append(m)

    # =========================================================================
    # SLIDE 02: CLINICAL PROBLEM STATEMENT & HEALTHCARE USE CASE
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_base(s2, prs, "CLINICAL RATIONALE // THE SUB-CLINICAL INFLAMMATORY BLINDSPOT",
                   "India's Disproportionate Asthma Crisis & The 24-36h Warning Gap",
                   "Why Outpatient Asthma Care Must Transition from Reactive Hospital Visits to Proactive Digital Twin Triage", 2)

    add_card(s2, Inches(0.4), Inches(1.6), Inches(6.1), Inches(5.1),
             "THE URBAN CLINICAL CHALLENGE", [
                 ("Disproportionate Mortality Burden", "India accounts for over 42% of global asthma mortality despite having approximately 13% of the world's asthma population (Lancet Global Health)."),
                 ("The 24-to-36-Hour Blindspot", "When particulate matter (PM2.5) surges during winter temperature inversions, bronchial mucosal swelling and smooth-muscle bronchoconstriction develop over 24-36 hours before patients perceive chest tightness."),
                 ("Siloed Healthcare Signals", "Pulmonary function records (FEV1), wearable telemetry (nocturnal SpO2 dips, HRV drops), and municipal AQI exist in isolated silos with zero cross-correlation."),
                 ("Costly Reactive Emergency Care", "Patients seek help only when forced expiratory volume collapses, driving preventable ICU admissions, systemic oral corticosteroid bursts, and high economic burden."),
             ], title_color=ACCENT_RED, page_num=2)

    add_card(s2, Inches(6.7), Inches(1.6), Inches(6.23), Inches(5.1),
             "HEALTHCARE USE CASES (DOCTOR & PATIENT PERSONAS)", [
                 ("Outpatient Cohort Prioritization", "Treating pulmonologists open a population-level triage roster automatically sorted by prospective 48-hour exacerbation risk, prioritizing unstable patients first."),
                 ("Mechanistic Physiological Inspection", "Clinicians inspect continuous airway inflammation state I(t), 3D GLSL thermal bronchial constriction, and personalized baseline vital deviations."),
                 ("Counterfactual Intervention Testing", "Doctors test preventive actions (N95 mask, stay indoors, air purifier, ICS step-up) on the patient's twin, evaluating predicted risk delta before clinical consultation."),
                 ("Continual Outlier Adaptation", "Free-text notes (such as concurrent typhoid or dengue fever) are parsed by Stage-3 LLM and integrated into the twin using Elastic Weight Consolidation (EWC)."),
                 ("Accessible Patient Companion", "Asthma patients receive plain-language guidance, CPCB AQI smog timelines, AI copilot breathing guides, and 1-tap emergency 112/108 access."),
             ], title_color=ACCENT_GOLD, page_num=2)

    # =========================================================================
    # SLIDE 03: FULL SYSTEM & CODEBASE ARCHITECTURE
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_base(s3, prs, "SYSTEM ARCHITECTURE // END-TO-END DATA FLOW",
                   "Multimodal Three-Stream Fusion & Service Gateway Architecture",
                   "From Wearable Sensor Ingestion to Mechanistic Latent ODE Simulation, Neural Stacking, and Dual Next.js Portals", 3)

    add_image_panel(s3, DOCS_DIR / "architecture.png", Inches(0.4), Inches(1.6), Inches(7.8), Inches(5.1),
                    "Full System Architecture Diagram (Data Streams, Neural Pipeline, Latent ODE, FastAPI & Next.js)", page_num=3)

    add_card(s3, Inches(8.4), Inches(1.6), Inches(4.53), Inches(5.1),
             "ARCHITECTURE HIGHLIGHTS", [
                 ("Layer 1: Multimodal Ingestion", "Stream 1: Static EHR (60 features) • Stream 2: Dynamic Wearables (20 ch x 12h) • Stream 3: Environmental AQI (70+ stations) • Database: PostgreSQL 16 + SQLAlchemy"),
                 ("Layer 2: Hybrid Twin Engine", "• Stage 1A: Dilated TCN (Static + Dynamic)\n• Stage 1B: XGBoost Multi-Target Suite\n• Stage 2: Stacking MLP Meta-Learner\n• Biophysical Latent ODE Airway Simulator\n• Stage 3: LLM Clinical Note Extractor"),
                 ("Layer 3: Delivery Gateway", "• FastAPI Service Layer (:8000 REST API)\n• Replay Simulation Clock (t = 12..239h)\n• Doctor Portal: Next.js 16 + Three.js\n• Patient Portal: Plain-language companion"),
                 ("Security & Standards", "ASD-STE100 technical documentation, DPDP Act data minimization, MIT Open Source."),
             ], title_color=ACCENT_GREEN, page_num=3)

    # =========================================================================
    # SLIDE 04: MULTIMODAL INGESTION & DATA STREAMS
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_base(s4, prs, "DATA ENGINEERING // THREE-STREAM DATA FUSION",
                   "Multimodal Input Ingestion, Telemetry Channels & Database Persistence",
                   "Harmonizing Longitudinal Clinical History, High-Frequency Biosensors, and Ambient City Pollution", 4)

    add_card(s4, Inches(0.4), Inches(1.6), Inches(4.0), Inches(5.1),
             "STREAM 01: STATIC CLINICAL EHR", [
                 ("Feature Dimensionality", "60 normalized clinical baseline attributes."),
                 ("Patient Demographics", "Age, sex, BMI, smoking history & pack-years."),
                 ("Baseline Spirometry", "FEV1 (% predicted), FEV1/FVC ratio, PEF."),
                 ("Medication Profile", "Prescribed controller regimen (ICS, LABA, LAMA) and documented baseline adherence %."),
                 ("Exacerbation History", "Prior annual flare-ups, emergency room visits, past ICU intubations."),
                 ("Storage Location", "aasthma/dataset/data/static/"),
             ], title_color=ACCENT_CYAN, page_num=4)

    add_card(s4, Inches(4.6), Inches(1.6), Inches(4.0), Inches(5.1),
             "STREAM 02: DYNAMIC WEARABLES", [
                 ("Sliding Window Lookback", "12-hour sliding window (20 channels @ 1h cadence)."),
                 ("Cardiorespiratory Biosensors", "Continuous SpO2 (%), resting heart rate, respiratory rate, HRV rMSSD (ms)."),
                 ("Activity & Rest biometrics", "Skin temperature, hourly step counts, deep sleep %, nocturnal awakenings."),
                 ("Symptom & Rescue Log", "SABA inhaler actuations, self-reported cough, wheeze, and dyspnea scores (0-3)."),
                 ("Storage Location", "aasthma/dataset/data/dynamic/"),
             ], title_color=ACCENT_GREEN, page_num=4)

    add_card(s4, Inches(8.8), Inches(1.6), Inches(4.13), Inches(5.1),
             "STREAM 03 & POSTGRESQL STORE", [
                 ("Ambient City Pollution", "Live and replayed PM2.5, PM10, AQI index, ambient temperature, relative humidity."),
                 ("CPCB Indian Grid", "70+ municipal monitoring stations across Delhi, Mumbai, Kolkata, Bengaluru, Jaipur."),
                 ("Simulation Replay Clock", "Simulates acute smog surges with scrubbable clock from t = 12h to t = 239h."),
                 ("PostgreSQL 16 Schema", "patients, timeseries_telemetry, clinical_events, patient_daily_logs, user_accounts."),
                 ("Storage Engine", "Dockerized PostgreSQL 16 (port 5432) with SQLAlchemy 2.0 and Psycopg 3."),
             ], title_color=ACCENT_GOLD, page_num=4)

    # =========================================================================
    # SLIDE 05: BIOPHYSICAL LATENT ODE AIRWAY SIMULATOR
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_base(s5, prs, "PHYSIOLOGICAL MODELING // MECHANISTIC LATENT ODE",
                   "Biophysical Airway Inflammation State Estimator & Counterfactual Engine",
                   "Grounding Black-Box Neural Models in Causal Pharmacological and Environmental Differential Equations", 5)

    add_card(s5, Inches(0.4), Inches(1.6), Inches(7.5), Inches(2.2),
             "STOCHASTIC DIFFERENTIAL EQUATION FORMULATION", [
                 ("Governing Equation", "dI/dt = -k·I(t) + a·Dose_PM(t) + b·Trigger(t) + δ_sys - c·η_abs·Controller(t) + σ·ξ(t)"),
                 ("State Variable I(t)", "Continuous latent airway inflammation state bounded in [0.05, 1.0]. Flare-up threshold = 0.65."),
                 ("Numerical Integration", "Euler-Maruyama stochastic solver executed at dt = 1.0h with personal baseline calibration."),
                 ("Counterfactual Speed", "Re-integrates 48-hour perturbed trajectories and feeds neural ensemble in < 65 ms."),
             ], title_color=ACCENT_GOLD, page_num=5)

    add_card(s5, Inches(0.4), Inches(3.95), Inches(7.5), Inches(2.75),
             "PHYSIOLOGICALLY AUDITED PARAMETERS & LITERATURE GROUNDING", [
                 ("Decay Rate k = 0.08 h⁻¹", "Spontaneous mucosal clearance & recovery (half-life ~8.6h; Barnes PJ, JACI 2010)."),
                 ("Particulate Intake a = 0.0009", "PM2.5 alveolar deposition scaled by airway hyperresponsiveness β_AHR (Guarnieri, Lancet 2014)."),
                 ("Trigger Sensitivity b = 0.02", "Vagal hyperresponsiveness to rapid temperature/humidity shifts (Graudenz, Chest 2006)."),
                 ("Systemic Spillover δ_sys", "Cytokine load (IL-6, TNF-α) from concurrent febrile infections extracted by Stage-3 LLM."),
                 ("ICS Efficacy c = 0.10 h⁻¹", "Eosinophilic clearance rate scaled by controller adherence & absorption (GINA 2023)."),
             ], title_color=ACCENT_GREEN, page_num=5)

    add_card(s5, Inches(8.1), Inches(1.6), Inches(4.83), Inches(5.1),
             "COUNTERFACTUAL WHAT-IF CAPABILITIES", [
                 ("Intervention 01: Stay Indoors", "Models zero outdoor transit exposure; indoor particulate concentration is governed by infiltration ratio (P = 0.65)."),
                 ("Intervention 02: Wear N95 Mask", "Applies 95% particulate filtration efficiency to all outdoor commute hours, blunting acute PM2.5 spikes."),
                 ("Intervention 03: HEPA Air Purifier", "Simulates continuous bedroom filtration, suppressing indoor PM2.5 by 70% and accelerating nocturnal airway healing."),
                 ("Intervention 04: ICS Step-Up", "Simulates 100% adherence to inhaled corticosteroid therapy, computing accelerated mucosal recovery rate."),
                 ("Clinical Utility", "Pulmonologists can verify whether environmental adaptations alone prevent an attack or whether medication step-up is mandatory."),
             ], title_color=ACCENT_CYAN, page_num=5)

    # =========================================================================
    # SLIDE 06: MULTI-STAGE MACHINE LEARNING PREDICTIVE ENSEMBLE
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_base(s6, prs, "MACHINE LEARNING CORE // 3-STAGE PREDICTIVE ENSEMBLE",
                   "Deep Dilated TCN + XGBoost Multi-Target + Stacking MLP Meta-Learner",
                   "Hierarchical Multimodal Architecture Achieving 0.940 (24h) and 0.943 (48h) Held-Out ROC-AUC", 6)

    add_card(s6, Inches(0.4), Inches(1.6), Inches(4.0), Inches(5.1),
             "STAGE 1A: DILATED TCN", [
                 ("Model Architecture", "DigitalTwinFusionModel in PyTorch."),
                 ("StaticMLPEncoder", "Encodes 60 static EHR features:\nLinear(60, 128) -> BatchNorm1d -> ReLU -> Dropout(0.2) -> Linear(128, 64)."),
                 ("Conv1DDynamicEncoder", "Ingests 20-channel x 12h telemetry matrix through 3 dilated 1D Conv blocks (d = 1, 2, 4) with channels 20 -> 32 -> 64 -> 128."),
                 ("Multi-Task Prediction Heads", "Concatenates static (64D) and dynamic (128D) into multi-head outputs:\n• logit_24h: 24h flare-up risk\n• logit_48h: 48h severe risk\n• logits_sev: 4 severity grades"),
                 ("Checkpoint File", "aasthma/training/model1/digital_twin_model.pt"),
             ], title_color=ACCENT_GREEN, page_num=6)

    add_card(s6, Inches(4.6), Inches(1.6), Inches(4.0), Inches(5.1),
             "STAGE 1B: XGBOOST SUITE", [
                 ("Model Architecture", "Multi-Target Gradient Boosted Trees."),
                 ("Statistical Feature Matrix", "Computes rolling window statistics (mean, std, min, max, delta) across all 20 wearable channels over 12 hours."),
                 ("Temporal Lag Shifts", "Incorporates lag shifts (t-2, t-1, t, t+1, t+2) to capture dynamic acceleration and vital trend drift."),
                 ("Static EHR Conditioning", "Fuses 60 baseline EHR features alongside tabular rolling aggregates."),
                 ("Independent Tree Heads", "Trained on identical patient folds to generate tree-based probability distributions."),
                 ("Checkpoint File", "aasthma/training/model2/gb_digital_twin_models.pkl"),
             ], title_color=ACCENT_CYAN, page_num=6)

    add_card(s6, Inches(8.8), Inches(1.6), Inches(4.13), Inches(5.1),
             "STAGE 2: STACKING META-LEARNER", [
                 ("Model Architecture", "RespiTwinMLPMetaLearner (PyTorch)."),
                 ("Input Probability Vector (12D)", "[tcn_24h, xgb_24h, tcn_48h, xgb_48h, tcn_sev_0..3, xgb_sev_0..3]."),
                 ("Non-Linear Fusion Head", "Linear(12, 32) -> BatchNorm1d -> ReLU -> Dropout(0.2) -> Linear(32, 16) -> ReLU -> 3 Task Heads."),
                 ("Conformal 90% Bands", "Computes statistical uncertainty bounds guaranteeing coverage under noisy biometrics."),
                 ("Personal SHAP Drivers", "Derives local SHAP attributions against personal baseline Z-scores in < 5 ms."),
                 ("Checkpoint File", "aasthma/training/meta_ensemble_model.pt"),
             ], title_color=ACCENT_GOLD, page_num=6)

    # =========================================================================
    # SLIDE 07: STAGE 3 LLM COPILOT & CONTINUAL RETRAINING (EWC)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_base(s7, prs, "CONTINUAL LEARNING // LLM FEATURE EXTRACTION & EWC",
                   "Dynamic Unstructured Clinical Note Ingestion & Anti-Forgetting Retraining",
                   "Extracting Pathophysiology from Free-Text Notes and Adapting the Meta-Learner without Catastrophic Forgetting", 7)

    add_card(s7, Inches(0.4), Inches(1.6), Inches(6.0), Inches(5.1),
             "STAGE 3: LLM CLINICAL FEATURE EXTRACTION", [
                 ("Unstructured Input Ingestion", "Clinicians input natural language observations (e.g., 'Patient diagnosed with Typhoid fever, 102.5°F, vomiting, dehydration, SpO2 down to 91%')."),
                 ("LLM Extraction Architecture", "Powered by OpenAI GPT-4o or Hugging Face InferenceClient (Llama-3.1-8B-Instruct / Qwen2.5-72B-Instruct) with Pydantic validation."),
                 ("Automated ICD-10 Mapping", "Identifies conditions (e.g. Typhoid Fever ICD-10: A01.0, Dengue A97.1) and maps systemic severity."),
                 ("Derived Vital Perturbations", "Generates quantitative offsets: ΔSkin Temp (+2.5°C), ΔResting HR (+25 bpm), ΔRR (+5 br/min), ΔSpO2 (-3.2%), and HRV reduction."),
                 ("Biophysical ODE Modifiers", "Injects systemic cytokine load (δ_sys = 0.65), scales airway hyperresponsiveness (β_AHR = 1.60), and modifies absorption efficiency (η_abs = 0.70)."),
             ], title_color=ACCENT_CYAN, page_num=7)

    add_card(s7, Inches(6.6), Inches(1.6), Inches(6.33), Inches(5.1),
             "CONTINUAL RETRAINING WITH EWC REGULARIZATION", [
                 ("Experience Replay Buffer", "Verified clinical outlier episodes are committed to PostgreSQL (`/api/patients/{id}/clinical-note/commit`) with full physician audit trails."),
                 ("The Catastrophic Forgetting Risk", "Retraining on rare infections can degrade the neural network's baseline asthma discrimination accuracy."),
                 ("Elastic Weight Consolidation (EWC)", "Adds a quadratic regularization penalty to the task loss proportional to parameter importance:\nL_total(θ) = L_outlier(θ) + (λ_EWC / 2) · Σ F_i · (θ_i - θ_i,base)²"),
                 ("Fisher Information Matrix F_i", "Computes diagonal Fisher information over baseline training distribution, freezing parameters critical to base asthma patterns while adapting unconstrained weights."),
                 ("Safety Verification Gate", "Retrained checkpoints undergo automatic Brier score calibration checks before deployment."),
             ], title_color=ACCENT_GREEN, page_num=7)

    # =========================================================================
    # SLIDE 08: DOCTOR INTERFACE — COHORT RISK TRIAGE
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_base(s8, prs, "CLINICAL INTERFACE 01 // POPULATION HEALTH TRIAGE",
                   "Outpatient Cohort Risk Roster & Replay Clock Controls",
                   "Instantaneous Risk-Ranked Triage Badges, CPCB Station AQI Overlays, and 48-Hour Alert Lead Times", 8)

    add_image_panel(s8, SCREENSHOTS_DIR / "02_doctor_cohort_triage.png", Inches(0.4), Inches(1.6), Inches(8.3), Inches(5.1),
                    "Doctor Portal: Ranked Asthma Patient Cohort Roster (/patients)", page_num=8)

    add_card(s8, Inches(8.9), Inches(1.6), Inches(4.03), Inches(5.1),
             "INTERFACE CAPABILITIES", [
                 ("Automated Risk Sorting", "Cohort automatically sorted by prospective 48h exacerbation probability."),
                 ("Population Summary Banner", "Displays total monitored (12), active critical alerts (9), cohort mean risk (75%), and regional AQI peaks (Mumbai 244)."),
                 ("Conformal CI & Lead Time", "Each patient row displays 48h risk, 90% conformal interval [94-100%], and alert warning lead time (> 32h)."),
                 ("Environmental DPCC Overlay", "Shows live municipal PM2.5 and AQI index for each patient's home station."),
                 ("Simulation Replay Clock", "Audits past flare-up progressions with -12h, +12h, +24h time scrubbing."),
                 ("Dark / Light Tactical Mode", "Instant switch between clinical white and low-strain tactical dark terminal UI."),
             ], title_color=ACCENT_GOLD, page_num=8)

    # =========================================================================
    # SLIDE 09: DOCTOR INTERFACE — 3D DIGITAL TWIN & THERMAL LUNG VIEWPORT
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_base(s9, prs, "CLINICAL INTERFACE 02 // 3D PULMONARY VIEWPORT",
                   "Three.js Anatomical Lung Viewer & GLSL Thermal Inflammation Shader",
                   "Real-Time Spatial Reveal of Bronchial Constriction, Region-of-Interest Inspection & Latent State Tracking", 9)

    add_image_panel(s9, DOCS_DIR.parent / "frontend" / "public" / "images" / "lung-thermal.png", Inches(0.4), Inches(1.6), Inches(5.8), Inches(5.1),
                    "WebGL GLSL Bronchial Thermal Inflammation Shader (/patients/[id])", page_num=9)

    add_card(s9, Inches(6.4), Inches(1.6), Inches(6.53), Inches(5.1),
             "PHYSIOLOGICAL TWIN VIEWPORT FEATURES", [
                 ("Interactive 3D Anatomical Mesh", "High-fidelity GLTF 3D tracheobronchial tree rendered with Three.js and responsive WebGL orbit controls."),
                 ("Dynamic GLSL Thermal Shader", "Procedural fragment shader maps latent airway inflammation state I(t) to an anatomical thermal heatmap (cool green to glowing critical amber/red)."),
                 ("Region of Interest (ROI) Inspection", "Clinicians can drill into specific anatomical zones: Mainstem Tracheobronchial Junction, Carina, Right/Left Apical & Basilar zones."),
                 ("Biophysical Metrics Overlay", "Latent Inflammation Load: I(t) = 0.53 / 1.00 (Threshold 0.65)\nAirway Resistance: +24% above personal baseline\nAmbient PM2.5: 62 µg/m³ • SABA Rescue Actuations: 7 doses in 24h"),
                 ("Personal Baseline Normalization", "Compares incoming 12h wearable telemetry against individual 7-day converged resting physiological baselines."),
             ], title_color=ACCENT_GREEN, page_num=9)

    # =========================================================================
    # SLIDE 10: DOCTOR INTERFACE — 24H/48H CONFORMAL FORECAST & SHAP
    # =========================================================================
    s10 = prs.slides.add_slide(blank_layout)
    set_slide_base(s10, prs, "CLINICAL INTERFACE 03 // CONFORMAL FORECAST & EXPLAINABILITY",
                   "Prospective Risk Gauges, Conformal Uncertainty Bands & SHAP Waterfall",
                   "Auditable 24h & 48h Risk Trajectories Scrubbable Across Time with Direct Physiological Driver Attribution", 10)

    add_image_panel(s10, SCREENSHOTS_DIR / "04_conformal_forecast_shap.png", Inches(0.4), Inches(1.6), Inches(8.3), Inches(5.1),
                    "Conformal Cumulative Risk Curve & SHAP Attribution Waterfall (/patients/[id]/forecast)", page_num=10)

    add_card(s10, Inches(8.9), Inches(1.6), Inches(4.03), Inches(5.1),
             "FORECAST & REASONING FEATURES", [
                 ("Dual Horizon Risk Gauges", "Prospective predictions for 24h flare-up risk (100%) and 48h severe exacerbation risk (100%)."),
                 ("90% Conformal Prediction Bands", "Guarantees statistical coverage under real-world sensor noise and missing wearable samples (CI: [95%-100%])."),
                 ("Hourly Timeline Scrubber", "Scrub through prospective hours t+0 to t+48 to inspect when risk crosses the 70% Alert Threshold."),
                 ("SHAP Feature Drivers", "Ranks dominant exacerbation contributors:\n• SABA Rescue Inhaler Spikes (+48% impact)\n• Nocturnal SpO2 desaturations\n• Elevated resting respiratory rate\n• Particulate PM2.5 exposure"),
                 ("Targeted Action Guidance", "Synthesizes clinical recommendations aligned directly with primary SHAP risk factors."),
             ], title_color=ACCENT_CYAN, page_num=10)

    # =========================================================================
    # SLIDE 11: DOCTOR INTERFACE — COUNTERFACTUAL WHAT-IF SANDBOX
    # =========================================================================
    s11 = prs.slides.add_slide(blank_layout)
    set_slide_base(s11, prs, "CLINICAL INTERFACE 04 // COUNTERFACTUAL INTERVENTION SANDBOX",
                   "Interactive Simulation Sandbox for Preventative Clinical Decision Support",
                   "Testing Outdoor Exposure, N95 Masks, HEPA Filtration, and ICS Adherence in < 65 ms Before Advising Patients", 11)

    add_image_panel(s11, SCREENSHOTS_DIR / "05_counterfactual_whatif_sandbox.png", Inches(0.4), Inches(1.6), Inches(8.3), Inches(5.1),
                    "Interactive Counterfactual What-If Simulation Sandbox (/patients/[id]/what-if)", page_num=11)

    add_card(s11, Inches(8.9), Inches(1.6), Inches(4.03), Inches(5.1),
             "WHAT-IF SANDBOX CAPABILITIES", [
                 ("Interactive Action Sliders", "1. Commute Exposure (0.0h to 6.0h/day) • 2. N95 Respirator (95% filtration) • 3. Controller Adherence (65% to 100%) • 4. HEPA Purifier (70% PM drop)"),
                 ("Real-Time Dual Comparison", "Side-by-side trajectory comparison: Without Changes (100% Risk, Swelling 0.53) vs With Your Actions (Calmed Airway 0.05)."),
                 ("Trajectory Divergence Graph", "Plots divergence between untreated path and simulated preventative regimen across 48 prospective hours."),
                 ("Sub-65ms Response Time", "Enables instantaneous what-if exploration during outpatient consultations."),
                 ("Clinical Decision Support", "Empowers doctors to prescribe lifestyle & adherence adjustments backed by quantitative risk reduction data."),
             ], title_color=ACCENT_GOLD, page_num=11)

    # =========================================================================
    # SLIDE 12: DOCTOR INTERFACE — NOTE ADAPTATION & OUTLIER STUDIO
    # =========================================================================
    s12 = prs.slides.add_slide(blank_layout)
    set_slide_base(s12, prs, "CLINICAL INTERFACE 05 // CLINICAL NOTE ADAPTATION & RETRAINING",
                   "Outlier Symptom Translator & Continual Retraining Studio",
                   "Transforming Free-Text Doctor Observations into Mechanistic Modifiers and Re-Training with EWC", 12)

    add_image_panel(s12, SCREENSHOTS_DIR / "06_clinical_note_adaptation_ewc.png", Inches(0.4), Inches(1.6), Inches(8.3), Inches(5.1),
                    "Clinical Note Adaptation & Outlier Re-Simulation Studio (/patients/[id]/adapt)", page_num=12)

    add_card(s12, Inches(8.9), Inches(1.6), Inches(4.03), Inches(5.1),
             "NOTE ADAPTATION WORKFLOW", [
                 ("Unstructured Note Parsing", "Doctors enter clinical notes (e.g. Typhoid, Dengue, acute gastroenteritis, beta-blocker initiation)."),
                 ("9 Derived Physiological Features", "Maps condition to ICD-10 (A01.0) and derives fever offsets, systemic endotoxemia, and vagal suppression."),
                 ("Instant Re-Simulation", "Re-evaluates twin with modified ODE state:\nLatent inflammation jumps from 0.53 to 0.96 (Critical Mucosal Stress)."),
                 ("Experience Replay Buffer", "One-click commit saves outlier trajectory to PostgreSQL audit log."),
                 ("EWC Retraining Trigger", "Fine-tunes RespiTwinMLPMetaLearner on outliers with quadratic Fisher regularization, preventing catastrophic forgetting."),
             ], title_color=ACCENT_GREEN, page_num=12)

    # =========================================================================
    # SLIDE 13: PATIENT PORTAL — PLAIN-LANGUAGE RISK & AQI ADVISORY
    # =========================================================================
    s13 = prs.slides.add_slide(blank_layout)
    set_slide_base(s13, prs, "PATIENT COMPANION 01 // ACCESSIBLE SELF-MANAGEMENT",
                   "Plain-Language Risk Status, Local AQI Advisory & Air Outlook",
                   "Jargon-Free Risk Status, Best/Worst Smog Windows, and Grounded Daily Asthmatic Guidance", 13)

    add_image_panel(s13, SCREENSHOTS_DIR / "07_patient_portal_desktop.png", Inches(0.4), Inches(1.6), Inches(8.3), Inches(5.1),
                    "Patient Portal Desktop Overview: Plain-Language Risk & City AQI (/patient-portal)", page_num=13)

    add_card(s13, Inches(8.9), Inches(1.6), Inches(4.03), Inches(5.1),
             "PATIENT-FACING FEATURES", [
                 ("Plain-Language Status Card", "Converts complex AI probabilities into intuitive cards: 'WATCH (REDUCED)' with easy-to-read gauges."),
                 ("Clear Physiological Explanation", "'Outdoor air quality is relatively calm today and your breathing and sleep signals have stayed close to your usual.'"),
                 ("City AQI & Best Windows", "New Delhi Anand Vihar: 108 AQI. Highlights best transit hours (2:00-4:30 PM) and worst smog inversion hours (morn/eve)."),
                 ("48-Hour Air Outlook", "6 granular blocks: Afternoon, Tonight, Tomorrow Morning, Afternoon, Night, Day 2."),
                 ("Personal Normal Comparison", "Shows whether body vitals (HR, RR, SpO2) are within individual resting normal bounds."),
             ], title_color=ACCENT_CYAN, page_num=13)

    # =========================================================================
    # SLIDE 14: PATIENT PORTAL — AI COPILOT REPORT & DAILY PRO CHECK-IN
    # =========================================================================
    s14 = prs.slides.add_slide(blank_layout)
    set_slide_base(s14, prs, "PATIENT COMPANION 02 // AI COPILOT & OUTCOME LOGGING",
                   "Guided Breathing Exercises, Emergency Flags & Daily Patient Check-In",
                   "Structured Copilot Guidance, Non-Pharmacological Precautions & Two-Way Symptom Syncing with Doctor", 14)

    add_image_panel(s14, SCREENSHOTS_DIR / "mobile_crop_light.png", Inches(0.4), Inches(1.6), Inches(2.9), Inches(5.1),
                    "Mobile Patient Portal Companion: 375px View", page_num=14)

    add_card(s14, Inches(3.5), Inches(1.6), Inches(4.8), Inches(5.1),
             "AI PATIENT COPILOT REPORT", [
                 ("Strict Safety Guardrails", "Non-prescriptive; never alters medication; reinforces clinician-approved action plan."),
                 ("Actionable Precautions", "Advises on indoor ventilation, keeping windows closed during morning smog, and wearing N95 during transit."),
                 ("Active Triggers to Avoid", "Highlights current outdoor particulate surges, humidity drops, and rapid temperature changes."),
                 ("Guided Breathing Exercises", "Step-by-step paced diaphragmatic and pursed-lip breathing routines to relieve respiratory tension."),
                 ("Emergency Red-Flag Warnings", "Alerts patient to critical danger signs (bluish lips, speaking in broken words, severe chest retractions) requiring immediate 112/108 response."),
             ], title_color=ACCENT_GOLD, page_num=14)

    add_card(s14, Inches(8.5), Inches(1.6), Inches(4.43), Inches(5.1),
             "DAILY PATIENT OUTCOME (PRO) LOG", [
                 ("Rescue Medication Tracker", "Logs daily short-acting beta-agonist (SABA) rescue inhaler puffs."),
                 ("Controller Confirmation", "Logs daily inhaled corticosteroid (ICS) doses taken to track true compliance."),
                 ("Symptom Severity Scales", "Self-reported cough, wheeze, dyspnea, and nocturnal awakening frequency."),
                 ("Direct Database Sync", "Instantly updates PostgreSQL timeseries telemetry ahead of next clinic visit."),
                 ("Emergency Response Access", "Top prominent banner with 1-tap call to India's 112 / 108 emergency ambulance network."),
             ], title_color=ACCENT_GREEN, page_num=14)

    # =========================================================================
    # SLIDE 15: EXPERIMENTAL VALIDATION & BENCHMARKS
    # =========================================================================
    s15 = prs.slides.add_slide(blank_layout)
    set_slide_base(s15, prs, "EXPERIMENTAL VALIDATION // BENCHMARKS & ABLATIONS",
                   "Comprehensive Quantitative Results Across Held-Out Patient Cohorts",
                   "Validating Discrimination Performance, Early Warning Lead Time, and Individual Component Ablations", 15)

    add_image_panel(s15, SCREENSHOTS_DIR / "08_benchmarks_and_validation.png", Inches(0.4), Inches(1.6), Inches(7.5), Inches(5.1),
                    "Model Ablation Suite & Discrimination Metrics (/benchmarks)", page_num=15)

    add_card(s15, Inches(8.1), Inches(1.6), Inches(4.83), Inches(5.1),
             "HELD-OUT BENCHMARK COMPARISONS", [
                 ("Experimental Cohort Split", "Patient-level split (800 train / 100 val / 100 held-out test patients; seed 42)."),
                 ("BreathTwin Hybrid Core (Proposed)", "• 24h ROC-AUC: 0.9399 | 48h ROC-AUC: 0.9428\n• PR-AUC: 0.8560 | Recall @ 0.5: 0.7281\n• Warning Lead Time: 42.4 ± 4.1 hours\n• False Alarms: 0.7 / wk | Latency: < 65 ms"),
                 ("Standard Recurrent Network (LSTM)", "• ROC-AUC: 0.7850 | PR-AUC: 0.6840\n• Warning Lead Time: 22.1 ± 5.8 hours"),
                 ("Tabular XGBoost-Only Baseline", "• ROC-AUC: 0.7410 | PR-AUC: 0.6310\n• Warning Lead Time: 18.6 ± 6.2 hours"),
                 ("Key Ablation Findings", "Removing the Mechanistic ODE State Estimator drops PR-AUC from 0.83 to 0.74, proving causal physiological filtering is vital for early lead time."),
             ], title_color=ACCENT_GREEN, page_num=15)

    # =========================================================================
    # SLIDE 16: MATHEMATICAL FOUNDATIONS & CLINICAL ASSUMPTIONS AUDIT
    # =========================================================================
    s16 = prs.slides.add_slide(blank_layout)
    set_slide_base(s16, prs, "MATHEMATICAL AUDIT // CLINICAL ASSUMPTIONS",
                   "Physiological Boundary Conditions & Published Literature Citations",
                   "Every Mechanistic Parameter and Algorithmic Calibrator is Grounded in Published Pulmonology Literature", 16)

    add_image_panel(s16, SCREENSHOTS_DIR / "09_clinical_assumptions.png", Inches(0.4), Inches(1.6), Inches(7.5), Inches(5.1),
                    "Biophysical Assumptions & Literature Citations Audit (/assumptions)", page_num=16)

    add_card(s16, Inches(8.1), Inches(1.6), Inches(4.83), Inches(5.1),
             "AUDITED PARAMETERS & CITATIONS", [
                 ("Recovery Rate k = 0.08 h⁻¹", "Spontaneous clearance of bronchial epithelial inflammation without continuous insult.\nSource: Barnes PJ, JACI 2010 (DOI: 10.1016/j.jaci.2010.02.034)"),
                 ("Particulate Intake a = 0.0045", "Rate of latent mucosal oxidative stress induction per unit of inhaled PM2.5.\nSource: Guarnieri & Balmes, Lancet 2014 (DOI: 10.1016/S0140-6736)"),
                 ("Trigger Sensitivity b = 0.020", "Vagal hyperresponsiveness responding to thermal shocks and humidity fluctuations.\nSource: Graudenz et al., Chest 2006 (DOI: 10.1378/chest.129.3.645)"),
                 ("ICS Clearance c = 0.120 h⁻¹", "Eosinophilic cascade suppression via corticosteroid receptor binding.\nSource: GINA Global Strategy for Asthma 2023"),
                 ("ASD-STE100 Compliance", "70% domain-adapted Simplified Technical English across all technical specifications."),
             ], title_color=ACCENT_CYAN, page_num=16)

    # =========================================================================
    # SLIDE 17: SECURITY, PRIVACY & ETHICAL GUARDRAILS
    # =========================================================================
    s17 = prs.slides.add_slide(blank_layout)
    set_slide_base(s17, prs, "ETHICAL & REGULATORY COMPLIANCE // DPDP ACT & SAFETY",
                   "Data Minimization, Role-Based Access & Clinical Decision Support Boundaries",
                   "Designed from First Principles to Safeguard Patient Privacy, Prevent Autonomous Prescribing, and Maintain Auditability", 17)

    add_card(s17, Inches(0.4), Inches(1.6), Inches(6.0), Inches(5.1),
             "DATA PRIVACY & REGULATORY COMPLIANCE", [
                 ("100% Synthetic Patient Data", "Strictly zero real patient Protected Health Information (PHI) or Personally Identifiable Information (PII) is stored or processed. Entire cohort generated via physiological simulation."),
                 ("DPDP Act (India) Compliance", "Engineered in strict adherence with India's Digital Personal Data Protection Act 2023:\n• Purpose limitation & storage minimization\n• No persistent identifiable tracking\n• Anonymized telemetry identifiers (PT-8821, PT-4409)"),
                 ("Cryptographic Session Guardrails", "Dual-role RBAC architecture enforcing cryptographic separation between doctor triage endpoints and patient self-management portals."),
                 ("Audit Logging & Reproducibility", "Full clinician-in-the-loop action logging stored in PostgreSQL with UTC timestamps."),
             ], title_color=ACCENT_CYAN, page_num=17)

    add_card(s17, Inches(6.6), Inches(1.6), Inches(6.33), Inches(5.1),
             "CLINICAL SAFETY & ETHICAL BOUNDARIES", [
                 ("Clinical Decision Support, Not Autonomous Diagnosis", "BreathTwin functions strictly as an assistive risk triage and counterfactual simulation platform. It does not issue independent medical diagnoses."),
                 ("Zero Autonomous Prescribing", "Stage-3 LLM prompts enforce non-prescriptive guardrails: copilot reports suggest lifestyle, ventilation, and breathing modifications while deferring drug adjustments to licensed physicians."),
                 ("Conformal Statistical Coverage", "Wrapping predictions in 90% conformal bands prevents overconfident algorithmic output during abnormal sensor dropouts."),
                 ("Auditable Open-Source Architecture", "Complete codebase licensed under permissive MIT Open-Source License for peer scrutiny and institutional verification."),
                 ("Standard Containerization", "Easily deployed on premises via Docker Compose with zero cloud telemetry egress."),
             ], title_color=ACCENT_GREEN, page_num=17)

    # =========================================================================
    # SLIDE 18: SUMMARY, DELIVERABLES & CONCLUSION
    # =========================================================================
    s18 = prs.slides.add_slide(blank_layout)
    set_slide_base(s18, prs, "PROJECT DELIVERABLES & CONCLUSION // REPRODUCIBILITY",
                   "BreathTwin Project Summary, Key Milestones & Repository Artifacts",
                   "Inter-College Engineering Collaboration (LNMIIT & NSUT) • Complete Open-Source Deliverables", 18)

    add_card(s18, Inches(0.4), Inches(1.6), Inches(6.0), Inches(5.1),
             "SUMMARY OF PROJECT ACHIEVEMENTS", [
                 ("Multimodal Digital Twin Delivered", "Successfully built and validated an end-to-end digital twin combining static EHR, 20-channel wearable biosensors, and municipal CPCB air quality telemetry."),
                 ("Exceptional Predictive Accuracy", "Achieved 0.9399 (24h) and 0.9428 (48h) ROC-AUC on patient-split held-out test data with 42.4-hour warning lead time."),
                 ("Real-Time Counterfactual Sandbox", "Developed biophysical latent ODE airway simulator evaluating interventions in < 65 ms."),
                 ("Dual Clinical & Patient Interfaces", "Interactive WebGL/Three.js 3D lung viewer for doctors and accessible, plain-language companion for patients."),
                 ("Continual Outlier Learning", "Pioneered LLM clinical note feature extraction with EWC anti-forgetting retraining."),
             ], title_color=ACCENT_GREEN, page_num=18)

    add_card(s18, Inches(6.6), Inches(1.6), Inches(6.33), Inches(5.1),
             "REPOSITORY ARTIFACTS & ACCESS DETAILS", [
                 ("Submission Identifier", "ABAY_LNMIIT/NSUT  |  Inter-College Team (LNMIIT Jaipur & NSUT New Delhi)"),
                 ("Public GitHub Repository", "https://github.com/Frisbee148/DigitalTwin  (MIT Open-Source License)"),
                 ("Documentation & Artifacts", "• docs/Architecture_Diagram.pdf (Complete High-Res Architecture)\n• docs/Project_Presentation.pdf (This Presentation Deck in PDF)\n• docs/Project_Presentation.pptx (Native PowerPoint Source)\n• README.md (ASD-STE100 Compliant Technical Documentation)"),
                 ("Quickstart Orchestration", "Single-command launch via `./run.sh` starts PostgreSQL 16, FastAPI (:8000), and Next.js 16 (:3000). Automated test suite via `pytest`."),
                 ("Demo Video", "15–20 Minute Unlisted YouTube Clinical & Architecture Demonstration."),
             ], title_color=ACCENT_GOLD, page_num=18)

    # 1. Save PPTX
    pptx_path = DOCS_DIR / "BreathTwin_Project_Presentation.pptx"
    prs.save(str(pptx_path))
    print(f"✓ Saved native PowerPoint presentation to: {pptx_path}")

    shutil.copy(pptx_path, DOCS_DIR / "Project_Presentation.pptx")
    shutil.copy(pptx_path, PUBLIC_DOCS_DIR / "Project_Presentation.pptx")
    print(f"✓ Copied to: {DOCS_DIR / 'Project_Presentation.pptx'}")

    # 2. Render initial PDF via LibreOffice to high-res slide images
    temp_lo_pdf = DOCS_DIR / "temp_impress_export.pdf"
    cmd_lo = [
        "soffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", str(DOCS_DIR),
        str(pptx_path)
    ]
    subprocess.run(cmd_lo, check=True)
    generated_lo_pdf = DOCS_DIR / "BreathTwin_Project_Presentation.pdf"
    
    # Render slides to 200 DPI PNGs
    print("Rendering slides to 200 DPI PNGs for universal ReportLab compilation...")
    cmd_ppm = [
        "pdftoppm",
        "-png",
        "-r", "200",
        str(generated_lo_pdf),
        str(HIGHRES_DIR / "slide")
    ]
    subprocess.run(cmd_ppm, check=True)

    # 3. Build Universal ReportLab PDF
    print("Building universal, glitch-free PDF presentation using ReportLab...")
    final_pdf_path = DOCS_DIR / "BreathTwin_Project_Presentation.pdf"
    
    # 960 x 540 points (16:9 widescreen)
    w, h = 960, 540
    c = canvas.Canvas(str(final_pdf_path), pagesize=(w, h))
    c.setTitle("BreathTwin (DigitalTwin) - Complete Project Presentation Deck")
    c.setAuthor("Team DigiTwin (LNMIIT & NSUT) - ABAY_LNMIIT/NSUT")
    c.setSubject("Multimodal Asthma Flare-Up Digital Twin - Architecture, Models, and Interfaces")
    c.setCreator("BreathTwin Presentation Builder (ReportLab)")

    for i in range(1, TOTAL_SLIDES + 1):
        slide_img = HIGHRES_DIR / f"slide-{i:02d}.png"
        if not slide_img.exists():
            raise FileNotFoundError(f"Missing high-res slide image: {slide_img}")

        # Draw deep solid background
        c.setFillColor(colors.HexColor("#020A05"))
        c.rect(0, 0, w, h, fill=1, stroke=0)

        # Draw the 200 DPI slide raster
        c.drawImage(str(slide_img), 0, 0, width=w, height=h)

        # Invisible text layer for text selection & searchability
        lines = SLIDE_TEXT_CORPUS.get(i, [])
        if lines:
            t = c.beginText(20, h - 30)
            t.setTextRenderMode(3)  # Invisible text mode
            t.setFont("Helvetica", 9)
            for line in lines:
                clean_line = line.replace("\n", " ").strip()
                if clean_line:
                    t.textLine(clean_line[:120])
            c.drawText(t)

        c.showPage()

    c.save()
    print(f"✓ Generated universal PDF presentation: {final_pdf_path} ({final_pdf_path.stat().st_size:,} bytes)")

    # Copy to target standardized locations
    for target in [DOCS_DIR / "Project_Presentation.pdf", PUBLIC_DOCS_DIR / "Project_Presentation.pdf"]:
        shutil.copy(final_pdf_path, target)
        print(f"✓ Updated target PDF: {target}")


if __name__ == "__main__":
    build_deck()
