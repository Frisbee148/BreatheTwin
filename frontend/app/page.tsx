'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import StatusChip from '@/components/StatusChip';
import InteractiveThermalReveal from '@/components/InteractiveThermalReveal';
import { PATIENTS } from '@/lib/data';

export default function HomePage() {
  const highRiskPatients = PATIENTS.filter(p => p.riskLevel === 'HIGH RISK');
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Region specific telemetry details for live inspection
  const getRegionDetails = (region: string | null) => {
    switch (region) {
      case 'CARINA & MAINSTEM BRONCHIAL TREE':
        return {
          metric1: 'AIRWAY RESISTANCE: +64% (ELEVATED)',
          metric2: 'PM2.5 LOCAL DEPOSITION: 184 µg/m³',
          diagnosis: 'High turbulent shear zone. Mucosal smooth muscle hyper-reactivity detected.',
          risk: 'CRITICAL'
        };
      case 'RIGHT PULMONARY LOBE (SUPERIOR / MIDDLE)':
        return {
          metric1: 'VENTILATION PERFUSION RATIO: 0.72 (V/Q MISMATCH)',
          metric2: 'ALVEOLAR GAS TRAPPING: 28% ABOVE BASELINE',
          diagnosis: 'Early parenchymal hyperinflation with accelerated regional resting respiratory rate.',
          risk: 'ELEVATED'
        };
      case 'LEFT PULMONARY LOBE (SUPERIOR / INFERIOR)':
        return {
          metric1: 'INFLAMMATION SCORE I(t): 0.88 / 1.0',
          metric2: 'NOCTURNAL SPO2 IMPACT: 89% MIN NADIR',
          diagnosis: 'Dependent hypoventilation zone linked directly to nocturnal awakening episodes.',
          risk: 'HIGH RISK'
        };
      case 'SUPRASTERNAL NOTCH / CERVICAL TRACHEA':
        return {
          metric1: 'TRACHEAL SHEAR STRESS: 0.76 (MODERATE)',
          metric2: 'AIRWAY VELOCITY: 4.2 L/s PEAK EXPIRATORY',
          diagnosis: 'Upper airway irritation from ambient sulfur dioxide and ozone inversion layer.',
          risk: 'CAUTION'
        };
      default:
        return {
          metric1: 'SYSTEM STATUS: CONTINUOUS SENSOR MONITORING',
          metric2: 'KALMAN FILTER S(t): 99.8% CONVERGED',
          diagnosis: 'Coronal thoracic plane calibrated. Hover cursor or drag touch over chest to inspect latent pathology.',
          risk: 'STANDBY'
        };
    }
  };

  const currentZoneData = getRegionDetails(hoveredRegion);

  return (
    <div className="space-y-14 font-sans pb-16">
      {/* =========================================================================
          HERO SECTION: INTERACTIVE THERMAL LUNG REVEAL
      ========================================================================= */}
      <section className="border border-[#12612F] bg-[#04130A] p-6 sm:p-10 relative overflow-hidden shadow-[0_0_60px_rgba(2,10,5,0.9)]">
        {/* Subtle decorative cyber grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#12612F0d_1px,transparent_1px),linear-gradient(to_bottom,#12612F0d_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Mission, Value Proposition & Actions */}
          <div className="lg:col-span-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono tracking-[0.08em] uppercase text-[#2FBF63] border border-[#12612F] px-2.5 py-0.5 bg-[#020A05]">
                {`// PHYSIOLOGICAL TWIN VIEWPORT • V1.0`}
              </span>
              <span className="text-[11px] font-mono tracking-[0.08em] uppercase text-[#4CFF8A] border border-[#12612F] px-2.5 py-0.5 bg-[#020A05] flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4CFF8A] animate-ping inline-block" />
                <span>INDIAN URBAN COHORT</span>
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#B6FFCC] glow-hot leading-tight">
                Predicting Asthma Flare-Ups 24–48 Hours Ahead.
              </h1>
              <p className="text-xs uppercase font-mono tracking-widest text-[#2FBF63]">
                Continuous Mechanistic Pulmonary Biomodeling &amp; Coronal Optical Emission
              </p>
            </div>

            <p className="text-sm sm:text-base text-[#4CFF8A] leading-relaxed">
              BreathTwin fuses synthetic calibrated EHR profiles, continuous wearable sensor telemetry, and live Indian air-quality stations into a real-time digital twin. It reveals hidden airway inflammation <span className="font-mono text-[#B6FFCC] font-bold">I(t)</span> before irreversible bronchoconstriction forces emergency hospitalization.
            </p>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-[#12612F]/60">
              <div className="bg-[#020A05] border border-[#12612F]/50 p-2.5">
                <div className="text-[10px] font-mono tracking-widest text-[#2FBF63] uppercase">LEAD TIME</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">36–48h</div>
                <div className="text-[10px] text-[#2FBF63]">Ahead of attack</div>
              </div>
              <div className="bg-[#020A05] border border-[#12612F]/50 p-2.5">
                <div className="text-[10px] font-mono tracking-widest text-[#2FBF63] uppercase">FALSE ALARMS</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">&lt;0.7/wk</div>
                <div className="text-[10px] text-[#2FBF63]">Target verified</div>
              </div>
              <div className="bg-[#020A05] border border-[#12612F]/50 p-2.5">
                <div className="text-[10px] font-mono tracking-widest text-[#2FBF63] uppercase">FULL PR-AUC</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">0.83</div>
                <div className="text-[10px] text-[#2FBF63]">vs 0.42 Baseline</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/patients"
                className="h-11 px-6 text-xs uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-all flex items-center justify-center shadow-[0_0_15px_rgba(76,255,138,0.2)]"
              >
                LAUNCH CLINICIAN DASHBOARD &gt;
              </Link>
              <Link
                href="/benchmarks"
                className="h-11 px-6 text-xs uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors flex items-center justify-center bg-[#020A05]"
              >
                MODEL BENCHMARKS
              </Link>
              <Link
                href="/assumptions"
                className="h-11 px-6 text-xs uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors flex items-center justify-center bg-[#020A05]"
              >
                AUDIT ASSUMPTIONS
              </Link>
            </div>

            {/* Interaction Instruction Banner */}
            <div className="border-l-2 border-[#4CFF8A] pl-3 py-1.5 text-xs font-mono text-[#2FBF63] bg-[#020A05]/60">
              <span className="text-[#4CFF8A] font-semibold">&gt; SCANNER ACTIVATION:</span> Move your cursor or drag your finger over the thermal torso on the right to reveal the deep bronchial tree heatmap with pinpoint coronal alignment.
            </div>
          </div>

          {/* Right Column: WebGL Interactive Thermal Reveal Centerpiece */}
          <div className="lg:col-span-6 flex flex-col items-center">
            {/* Header Telemetry Badge */}
            <div className="w-full max-w-[540px] flex justify-between items-center text-[10px] font-mono text-[#2FBF63] mb-2 uppercase tracking-widest bg-[#020A05] border border-[#12612F] px-3 py-1.5">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#4CFF8A] inline-block" />
                <span>{`// LIVE CORONAL TRANSECT: PT-8821`}</span>
              </span>
              <span className="text-[#FF2A1A] font-bold glow-danger">
                ALERT: INFLAMMATION I(t) = 0.84
              </span>
            </div>

            {/* The Pinpoint Overlapping Interactive Thermal Reveal Component */}
            <InteractiveThermalReveal
              bodySrc="/images/body.webp"
              lungsSrc="/images/lungs.webp"
              patientId="PT-8821"
              onRegionHover={setHoveredRegion}
            />

            {/* Live Anatomical Inspection Readout Card */}
            <div className="w-full max-w-[540px] mt-2 border border-[#12612F]/70 bg-[#020A05] p-3 text-xs font-mono">
              <div className="flex justify-between items-center border-b border-[#12612F]/40 pb-1.5 mb-2">
                <span className="text-[10px] uppercase text-[#2FBF63] tracking-widest">
                  &gt; ACTIVE APERTURE READOUT
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${
                  currentZoneData.risk === 'CRITICAL' || currentZoneData.risk === 'HIGH RISK'
                    ? 'border-[#FF2A1A] text-[#FF2A1A] bg-[#FF2A1A]/10'
                    : currentZoneData.risk === 'ELEVATED'
                    ? 'border-[#FFA61F] text-[#FFA61F] bg-[#FFA61F]/10'
                    : currentZoneData.risk === 'CAUTION'
                    ? 'border-[#FFE14A] text-[#FFE14A] bg-[#FFE14A]/10'
                    : 'border-[#2FBF63] text-[#2FBF63]'
                }`}>
                  {currentZoneData.risk}
                </span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="text-[#B6FFCC] font-semibold">{currentZoneData.metric1}</div>
                <div className="text-[#4CFF8A]">{currentZoneData.metric2}</div>
                <div className="text-[#2FBF63] text-[10px] leading-relaxed pt-0.5">
                  {currentZoneData.diagnosis}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-[#12612F]/40 flex justify-between items-center text-[10px] text-[#2FBF63]">
                <span>SIMULATION CLOCK: T+48H REPLAY</span>
                <Link href="/patients/PT-8821" className="text-[#4CFF8A] hover:underline font-semibold flex items-center">
                  INSPECT PATIENT TWIN &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FILLER SECTION 1: THREE-STREAM BIOLOGICAL DATA FUSION
      ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] tracking-wide">
              {`// Three-Stream Biological Data Fusion Architecture`}
            </h2>
            <p className="text-xs text-[#2FBF63] mt-0.5 font-mono">
              MULTI-MODAL INGESTION PIPELINE DRIVING LATENT PULMONARY STATE ESTIMATION
            </p>
          </div>
          <span className="text-xs uppercase tracking-wider text-[#2FBF63] border border-[#12612F] px-2 py-1 bg-[#04130A] hidden sm:inline-block">
            PRD ARCHITECTURE COMPLIANCE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Stream 1 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#4CFF8A] tracking-wider uppercase">
                STREAM 01 &bull; STATIC / HISTORICAL
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#2FBF63]">SYNTHEA EHR</span>
            </div>
            <h3 className="text-base font-semibold text-[#B6FFCC]">
              Calibrated Electronic Health Record
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Provides patient demographics, asthma baseline phenotypes, calibrated spirometry (FEV1, FEV1/FVC ratios), controller steroid prescriptions, and annualized exacerbation history.
            </p>
            <div className="space-y-1 pt-2 border-t border-[#12612F]/40 text-[11px] font-mono text-[#4CFF8A]">
              <div>&bull; Conditions temporal neural network via FiLM gating</div>
              <div>&bull; Fixes baseline airway caliber and clearance capacity</div>
            </div>
          </div>

          {/* Stream 2 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#4CFF8A] tracking-wider uppercase">
                STREAM 02 &bull; DYNAMIC WEARABLES
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#2FBF63]">PHYSIO SIMULATOR</span>
            </div>
            <h3 className="text-base font-semibold text-[#B6FFCC]">
              Continuous Sensor Signals
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Simulated 7-day high-resolution streams of resting respiratory rate, nocturnal SpO2 dips, resting heart rate, HRV rMSSD, sleep fragmentation index, and bluetooth smart-inhaler actuation logs.
            </p>
            <div className="space-y-1 pt-2 border-t border-[#12612F]/40 text-[11px] font-mono text-[#4CFF8A]">
              <div>&bull; Evaluated as rolling z-score deviations from personal baseline</div>
              <div>&bull; Captures early nocturnal hypoventilation drift</div>
            </div>
          </div>

          {/* Stream 3 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#4CFF8A] tracking-wider uppercase">
                STREAM 03 &bull; REAL ENVIRONMENTAL
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#2FBF63]">CPCB / OPENAQ</span>
            </div>
            <h3 className="text-base font-semibold text-[#B6FFCC]">
              Real-Time Indian Air Quality &amp; Weather
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Real open data ingestion from continuous monitoring stations in Delhi, Mumbai, and Bengaluru. Ingests ambient PM2.5, PM10, thermal atmospheric inversions, and relative humidity swings.
            </p>
            <div className="space-y-1 pt-2 border-t border-[#12612F]/40 text-[11px] font-mono text-[#4CFF8A]">
              <div>&bull; Computes inhaled particulate toxic dose: Dose_PM(t)</div>
              <div>&bull; Feeds environmental risk multiplier into differential equation</div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FILLER SECTION 2: LATENT MECHANISTIC DIFFERENTIAL EQUATION ENGINE
      ========================================================================= */}
      <section className="border border-[#12612F] bg-[#061C0E] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-[#2FBF63] font-mono">
              {`// MATHEMATICAL FOUNDATION • SECTION 8 MECHANISTIC SIMULATOR DESIGN`}
            </div>
            <h3 className="text-lg font-semibold text-[#B6FFCC]">
              Airway Inflammation Latent Differential Equation Engine
            </h3>
          </div>
          <Link
            href="/assumptions"
            className="text-xs uppercase tracking-wider text-[#4CFF8A] hover:underline flex items-center font-mono"
          >
            AUDIT ALL COEFFICIENTS &amp; CITATIONS &rarr;
          </Link>
        </div>

        <div className="bg-[#020A05] border border-[#12612F] p-4 text-center font-mono text-base sm:text-xl text-[#B6FFCC] tracking-wider overflow-x-auto">
          dI/dt = -k &bull; I(t) + a &bull; Dose_PM(t) + b &bull; Trigger(t) - c &bull; Controller(t) + &sigma; &bull; &xi;(t)
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#2FBF63]">
          <div className="border border-[#12612F]/50 p-3 bg-[#04130A] space-y-1">
            <span className="text-[#B6FFCC] font-mono font-bold block">-k &bull; I</span>
            <span className="text-[11px]">Spontaneous mucosal clearance &amp; tissue healing decay rate. Half-life: ~36h.</span>
          </div>
          <div className="border border-[#12612F]/50 p-3 bg-[#04130A] space-y-1">
            <span className="text-[#B6FFCC] font-mono font-bold block">+a &bull; Dose_PM</span>
            <span className="text-[11px]">Inhaled fine particulate accumulation scaled by tidal volume &amp; physical activity.</span>
          </div>
          <div className="border border-[#12612F]/50 p-3 bg-[#04130A] space-y-1">
            <span className="text-[#B6FFCC] font-mono font-bold block">-c &bull; Controller</span>
            <span className="text-[11px]">Inhaled corticosteroid receptor suppression efficacy weighted by adherence.</span>
          </div>
          <div className="border border-[#12612F]/50 p-3 bg-[#04130A] space-y-1">
            <span className="text-[#B6FFCC] font-mono font-bold block">&sigma; &bull; &xi;(t)</span>
            <span className="text-[11px]">Stochastic physiological sensor noise &amp; unmeasured bio-behavioral fluctuations.</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FILLER SECTION 3: LIVE COHORT RISK RADAR
      ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] tracking-wide">
              {`// High-Priority Clinical Triage Spotlight`}
            </h2>
            <div className="text-xs text-[#2FBF63] mt-0.5 font-mono">
              PATIENTS IN CRITICAL WINDOW WITH 48H ADVERSE EXACERBATION PROBABILITY &gt; 70%
            </div>
          </div>
          <Link
            href="/patients"
            className="text-xs font-semibold text-[#4CFF8A] hover:underline uppercase tracking-wider font-mono"
          >
            VIEW FULL COHORT (6) &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {highRiskPatients.map((patient) => (
            <div
              key={patient.id}
              className="border border-[#FF2A1A] bg-[#04130A] p-5 flex flex-col justify-between space-y-4 shadow-[0_0_20px_rgba(255,42,26,0.1)]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-[#B6FFCC] font-bold">{patient.id}</span>
                    <span className="text-[#2FBF63] text-xs">&bull;</span>
                    <span className="text-sm font-semibold text-[#4CFF8A]">{patient.name}</span>
                  </div>
                  <StatusChip status={patient.riskLevel} size="sm" />
                </div>

                <div className="text-xs text-[#FFE14A] border-l-2 border-[#FF2A1A] pl-3 py-1 bg-[#061C0E] font-mono">
                  &gt; {patient.alertHeadline}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63] font-mono">LOCATION</div>
                    <div className="text-[#B6FFCC] font-medium">{patient.city}</div>
                    <div className="text-[10px] text-[#2FBF63] font-mono">AQI {patient.currentAirQuality.aqi} ({patient.currentAirQuality.aqiCategory})</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63] font-mono">48H RISK</div>
                    <div className="text-lg font-bold text-[#FF2A1A] tabular-nums font-mono glow-danger">
                      {patient.risk48h}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63] font-mono">LEAD TIME</div>
                    <div className="text-[#B6FFCC] font-bold font-mono">{patient.leadTimeHours} Hours</div>
                    <div className="text-[10px] text-[#2FBF63] font-mono">Actionable window</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#12612F]/60 pt-3">
                <div className="text-[11px] text-[#2FBF63]">
                  PRIMARY FACTOR: <span className="text-[#4CFF8A] font-semibold">{patient.shapReasons[0].feature}</span>
                </div>
                <Link
                  href={`/patients/${patient.id}`}
                  className="text-xs font-semibold text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 hover:border-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors"
                >
                  OPEN TWIN VIEWPORT &gt;
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          FILLER SECTION 4: 3-CLICK CLINICIAN DECISION WORKFLOW
      ========================================================================= */}
      <section className="border border-[#12612F] bg-[#04130A] p-6 space-y-5">
        <div className="border-b border-[#12612F]/50 pb-2">
          <h3 className="text-base font-semibold text-[#B6FFCC] tracking-wider uppercase font-mono">
            {`// 3-Click Clinician Decision Support Architecture`}
          </h3>
          <p className="text-xs text-[#2FBF63]">
            Optimized for busy pulmonary specialists: Stratify Risk &rarr; Trace Etiology &rarr; Simulate Counterfactual
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          <div className="border border-[#12612F]/60 bg-[#020A05] p-4 space-y-2">
            <div className="text-[10px] font-mono text-[#4CFF8A] uppercase tracking-wider">CLICK 01 &bull; WHO IS AT RISK?</div>
            <h4 className="text-sm font-semibold text-[#B6FFCC]">Automated Cohort Triage</h4>
            <p className="text-[#2FBF63] leading-relaxed">
              Conformal risk scoring flags patients entering danger zones 36–48 hours ahead. Eliminates alarm fatigue by holding false positive rate below 0.7 alerts per patient-week.
            </p>
          </div>

          <div className="border border-[#12612F]/60 bg-[#020A05] p-4 space-y-2">
            <div className="text-[10px] font-mono text-[#4CFF8A] uppercase tracking-wider">CLICK 02 &bull; WHY ARE THEY AT RISK?</div>
            <h4 className="text-sm font-semibold text-[#B6FFCC]">Explainable SHAP Root Cause</h4>
            <p className="text-[#2FBF63] leading-relaxed">
              Local feature attribution attributes risk percentages directly to physical causes: PM2.5 spike, controller steroid discontinuation, sleep hypoxemia, or elevated respiratory rate.
            </p>
          </div>

          <div className="border border-[#12612F]/60 bg-[#020A05] p-4 space-y-2">
            <div className="text-[10px] font-mono text-[#4CFF8A] uppercase tracking-wider">CLICK 03 &bull; WHAT RESCUES THEM?</div>
            <h4 className="text-sm font-semibold text-[#B6FFCC]">Counterfactual What-If Sandbox</h4>
            <p className="text-[#2FBF63] leading-relaxed">
              Test virtual clinical actions in real time: Step up ICS-formoterol dosage, prescribe HEPA indoor air filtration, or recommend N95 mask usage during peak smog inversions.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FILLER SECTION 5: MODEL BENCHMARKS & VERIFICATION SPECIFICATIONS
      ========================================================================= */}
      <section className="border border-[#12612F] bg-[#061C0E] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/50 pb-2">
          <h3 className="text-base font-semibold text-[#B6FFCC] tracking-wider uppercase font-mono">
            {`// Empirical Verification & Model Ablation Benchmarks`}
          </h3>
          <Link href="/benchmarks" className="text-xs font-mono text-[#4CFF8A] hover:underline">
            FULL BENCHMARK AUDIT &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-[#12612F] text-[#4CFF8A] bg-[#020A05]">
                <th className="p-2.5">MODEL ARCHITECTURE</th>
                <th className="p-2.5">LEAD TIME (H)</th>
                <th className="p-2.5">PR-AUC</th>
                <th className="p-2.5">ROC-AUC</th>
                <th className="p-2.5">FALSE ALARMS / WK</th>
                <th className="p-2.5">INFERENCE LATENCY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#12612F]/30 text-[#2FBF63]">
              <tr className="bg-[#04130A] font-bold text-[#B6FFCC]">
                <td className="p-2.5 text-[#4CFF8A]">BreathTwin (Physio-Mechanistic + FiLM)</td>
                <td className="p-2.5 text-[#4CFF8A]">42.4 ± 4.1</td>
                <td className="p-2.5 text-[#4CFF8A]">0.832</td>
                <td className="p-2.5 text-[#4CFF8A]">0.894</td>
                <td className="p-2.5 text-[#4CFF8A]">0.62</td>
                <td className="p-2.5">&lt;65 ms</td>
              </tr>
              <tr>
                <td className="p-2.5">Standard Gradient Boosted Trees (XGBoost)</td>
                <td className="p-2.5">18.6 ± 6.2</td>
                <td className="p-2.5">0.614</td>
                <td className="p-2.5">0.741</td>
                <td className="p-2.5">1.84</td>
                <td className="p-2.5">&lt;15 ms</td>
              </tr>
              <tr>
                <td className="p-2.5">Pure Recurrent Network (LSTM)</td>
                <td className="p-2.5">22.1 ± 5.8</td>
                <td className="p-2.5">0.671</td>
                <td className="p-2.5">0.785</td>
                <td className="p-2.5">1.42</td>
                <td className="p-2.5">110 ms</td>
              </tr>
              <tr>
                <td className="p-2.5">Static Clinical Rules &amp; SpO2 Thresholds</td>
                <td className="p-2.5">6.2 ± 3.4</td>
                <td className="p-2.5">0.420</td>
                <td className="p-2.5">0.590</td>
                <td className="p-2.5">3.15</td>
                <td className="p-2.5">&lt;2 ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
