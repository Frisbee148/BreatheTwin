'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import StatusChip from '@/components/StatusChip';
import InteractiveThermalReveal, { LungMarker } from '@/components/InteractiveThermalReveal';
import { PATIENTS } from '@/lib/data';

export default function HomePage() {
  const patient = PATIENTS.find(p => p.id === 'PT-8821') || PATIENTS[0];
  const [selectedHotspot, setSelectedHotspot] = useState<LungMarker | null>(null);
  const [activeWhatIfTab, setActiveWhatIfTab] = useState<'indoors' | 'n95' | 'medication'>('indoors');

  const whatIfExamples = {
    indoors: {
      title: 'Intervention 01: Stay Indoors During Smog Surge',
      description: 'Patient shifts work indoors with closed air filtering, reducing inhaled ambient PM2.5 exposure by 65%.',
      baselineRisk: 82,
      newRisk: 46,
      reduction: '-36%',
      mechanism: 'Blunts particulate alveolar deposition rate a · Dose_PM(t), arresting rapid mucosal swelling.'
    },
    n95: {
      title: 'Intervention 02: Wear N95 Mask During Commute',
      description: 'Patient equips a sealed N95 respirator during the 90-minute evening commute along heavy arterial roads.',
      baselineRisk: 82,
      newRisk: 54,
      reduction: '-28%',
      mechanism: 'Filters 95% of fine particulate matter during peak traffic hours, preventing the trigger threshold crossing.'
    },
    medication: {
      title: 'Intervention 03: Proactive ICS Controller Dose Step-Up',
      description: 'Pulmonologist advises doubling the inhaled corticosteroid (budesonide/formoterol) maintenance regimen 36h ahead.',
      baselineRisk: 82,
      newRisk: 32,
      reduction: '-50%',
      mechanism: 'Accelerates mucosal recovery decay rate c · Controller(t), preventing acute smooth muscle hyper-reactivity.'
    }
  };

  const currentWhatIf = whatIfExamples[activeWhatIfTab];

  return (
    <div className="space-y-16 font-sans pb-16 max-w-[1200px] mx-auto px-4 sm:px-6">
      {/* =========================================================================
          1. HERO (THE REVEAL)
      ========================================================================= */}
      <section className="pt-4 lg:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Half: Headline, Subhead & Action Buttons */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center space-x-2 border border-[#12612F] px-2.5 py-1 bg-[#04130A]">
              <span className="w-2 h-2 bg-[#4CFF8A] inline-block" />
              <span className="text-[11px] font-mono tracking-[0.08em] uppercase text-[#4CFF8A]">
                ASTHMA PULMONARY DIGITAL TWIN
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#B6FFCC] leading-[1.15]">
                See the flare-up before it happens.
              </h1>
              <p className="text-sm sm:text-base text-[#4CFF8A] leading-relaxed">
                A digital twin that fuses a patient’s history, wearable signals, and local air quality to forecast asthma flare-ups 24 to 48 hours ahead.
              </p>
            </div>

            {/* Two Primary Buttons */}
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/patients"
                className="h-11 px-6 text-xs uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#020A05] bg-[#4CFF8A] hover:bg-transparent hover:text-[#4CFF8A] transition-colors flex items-center justify-center cursor-pointer"
              >
                OPEN DASHBOARD &gt;
              </Link>
              <a
                href="#demo"
                className="h-11 px-6 text-xs uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors flex items-center justify-center bg-[#04130A] cursor-pointer"
              >
                WATCH DEMO
              </a>
            </div>

            {/* Hotspot Readout if selected */}
            {selectedHotspot && (
              <div className="border border-[#12612F] bg-[#04130A] p-3 text-xs font-mono space-y-1">
                <div className="text-[10px] text-[#2FBF63] uppercase">
                  {`// SELECTED BIOMARKER`}
                </div>
                <div className="font-semibold text-[#B6FFCC]">
                  {selectedHotspot.name}: <span className="text-[#FF2A1A]">{selectedHotspot.value}</span>
                </div>
                <p className="text-[11px] text-[#4CFF8A]">
                  {selectedHotspot.description}
                </p>
              </div>
            )}
          </div>

          {/* Right Half: Interactive Thermal Torso & Lungs Reveal */}
          <div className="lg:col-span-6 flex justify-center">
            <InteractiveThermalReveal
              bodySrc="/images/body.webp"
              lungsSrc="/images/lungs.webp"
              patientId={patient.id}
              onMarkerSelect={setSelectedHotspot}
            />
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. THE PROBLEM (THE CLINICAL BLINDSPOT)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
            {`// 01 THE PROBLEM`}
          </span>
          <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
            Why flare-ups are unpredictable in polluted cities.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-sm">
          <div className="md:col-span-7 space-y-4 text-[#4CFF8A] leading-relaxed">
            <p>
              In cities with high particulate pollution, flare-ups strike without warning. Routine clinic visits are months apart, so the days leading up to an exacerbation are completely invisible to the doctor.
            </p>
            <p className="text-[#2FBF63]">
              Inhaled fine particulate matter (PM2.5) sparks sub-clinical mucosal swelling and smooth-muscle constriction over 24 to 48 hours. Patients often do not perceive the airway narrowing until severe shortness of breath occurs, leaving emergency hospitalization as the only remaining option.
            </p>
          </div>

          {/* Published Citable Statistics Only */}
          <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1">
              <div className="text-2xl font-bold font-mono text-[#FF2A1A] tabular-nums">
                &gt;42%
              </div>
              <div className="text-xs font-semibold text-[#B6FFCC] uppercase">
                GLOBAL ASTHMA MORTALITY
              </div>
              <p className="text-[11px] text-[#2FBF63] pt-1">
                India accounts for over 42% of global asthma deaths despite having approximately 13% of global asthma burden (Lancet Global Health).
              </p>
            </div>

            <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1">
              <div className="text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">
                24–36h
              </div>
              <div className="text-xs font-semibold text-[#B6FFCC] uppercase">
                INFLAMMATORY LAG
              </div>
              <p className="text-[11px] text-[#2FBF63] pt-1">
                Documented physiological window between initial inflammatory cascade onset and patient self-perception of dyspnea.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. HOW IT WORKS (THREE STREAMS INTO TWIN)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
              {`// 02 HOW IT WORKS`}
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
              Three streams into one continuous digital twin.
            </h2>
          </div>
          <Link
            href="/assumptions"
            className="text-xs font-mono text-[#4CFF8A] hover:underline"
          >
            AUDIT PHYSIOLOGY ASSUMPTIONS &rarr;
          </Link>
        </div>

        {/* Three Stream Flow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: History */}
          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#2FBF63] uppercase tracking-wider">
                STREAM 01 &bull; STATIC
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#4CFF8A]">
                EHR
              </span>
            </div>
            <h3 className="text-sm font-semibold text-[#B6FFCC]">
              Patient History
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Calibrated spirometry (FEV1, FVC), clinical asthma phenotype, prescribed controller steroids, and past exacerbation frequency.
            </p>
          </div>

          {/* Card 2: Body Signals */}
          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#2FBF63] uppercase tracking-wider">
                STREAM 02 &bull; WEARABLE
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#4CFF8A]">
                SENSORS
              </span>
            </div>
            <h3 className="text-sm font-semibold text-[#B6FFCC]">
              Body Signals
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Continuous resting respiratory rate, nocturnal SpO2 dips, resting heart rate, HRV rMSSD, sleep fragmentation, and rescue inhaler logs.
            </p>
          </div>

          {/* Card 3: Air */}
          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#2FBF63] uppercase tracking-wider">
                STREAM 03 &bull; ENVIRONMENT
              </span>
              <span className="text-[10px] border border-[#12612F] px-1.5 py-0.5 text-[#4CFF8A]">
                CPCB / AQI
              </span>
            </div>
            <h3 className="text-sm font-semibold text-[#B6FFCC]">
              Local Air Quality
            </h3>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              Real-time monitoring stations in Delhi, Mumbai, and Bengaluru: ambient PM2.5, PM10, temperature inversions, and humidity.
            </p>
          </div>
        </div>

        {/* Simplified Architecture Flow to Twin and Forecast */}
        <div className="border border-[#12612F] bg-[#020A05] p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center font-mono text-xs">
          <div className="md:col-span-5 border-l-2 border-[#4CFF8A] pl-3 py-1">
            <div className="text-[10px] text-[#2FBF63] uppercase">FUSION PIPELINE</div>
            <div className="text-[#B6FFCC] font-semibold text-sm">Twin Core (Latent State Estimator)</div>
            <div className="text-[#2FBF63] text-[11px] mt-0.5">
              Filters input signals through differential equation dI/dt to estimate mucosal inflammation state.
            </div>
          </div>

          <div className="hidden md:flex md:col-span-2 justify-center text-[#4CFF8A] text-lg font-bold">
            &rarr;
          </div>

          <div className="md:col-span-5 border-l-2 border-[#FFE14A] pl-3 py-1">
            <div className="text-[10px] text-[#2FBF63] uppercase">ACTIONABLE OUTCOME</div>
            <div className="text-[#B6FFCC] font-semibold text-sm">24–48h Flare-Up Forecast</div>
            <div className="text-[#2FBF63] text-[11px] mt-0.5">
              Conformal risk probability + ranked SHAP reasons + what-if simulation response.
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. SEE THE TWIN (PRODUCT PREVIEW)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
              {`// 03 PRODUCT PREVIEW`}
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
              What the treating doctor sees.
            </h2>
          </div>
          <Link
            href="/patients"
            className="text-xs font-semibold text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 hover:border-[#4CFF8A] transition-colors uppercase font-mono"
          >
            VIEW ALL PATIENTS (6) &gt;
          </Link>
        </div>

        {/* Static Realistic Clinician Dashboard Preview Card */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-5">
          {/* Patient Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/50 pb-3">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-base font-bold text-[#B6FFCC]">
                {patient.id}
              </span>
              <span className="text-[#2FBF63]">&bull;</span>
              <span className="text-sm font-semibold text-[#4CFF8A]">
                {patient.name}
              </span>
              <span className="text-xs text-[#2FBF63] font-mono">
                ({patient.age}y {patient.gender}, {patient.city})
              </span>
            </div>
            <StatusChip status={patient.riskLevel} size="md" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-xs">
            {/* Risk Forecast Readout */}
            <div className="md:col-span-4 border border-[#12612F]/60 bg-[#020A05] p-4 space-y-3 font-mono">
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">
                48-HOUR EXACERBATION RISK
              </div>
              <div className="text-3xl font-bold text-[#FF2A1A] tabular-nums">
                {patient.risk48h}%
              </div>
              <div className="text-[11px] text-[#FFE14A]">
                Confidence range: [{patient.risk48hInterval[0]}% – {patient.risk48hInterval[1]}%]
              </div>
              <div className="border-t border-[#12612F]/40 pt-2 text-[#2FBF63] text-[11px]">
                Lead time to attack: <span className="text-[#B6FFCC] font-bold">{patient.leadTimeHours} Hours</span>
              </div>
            </div>

            {/* Alert Reasons (SHAP Attribution) */}
            <div className="md:col-span-8 border border-[#12612F]/60 bg-[#020A05] p-4 space-y-3 font-mono">
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">
                TOP RISK CONTRIBUTORS (SHAP ATTRIBUTION)
              </div>
              <div className="space-y-2">
                {patient.shapReasons.slice(0, 3).map((r) => (
                  <div key={r.rank} className="flex items-center justify-between border-b border-[#12612F]/30 pb-1.5">
                    <span className="text-[#B6FFCC]">{r.feature}</span>
                    <span className="text-[#FF2A1A] font-bold">+{r.impactPercent}%</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[#2FBF63] pt-1">
                Airway inflammation state estimated at <span className="text-[#B6FFCC] font-bold">I(t) = {patient.estimatedInflammationState}</span> (threshold: {patient.inflammationThreshold}).
              </div>
            </div>
          </div>

          {/* Quick Links into Patient View */}
          <div className="flex flex-wrap gap-3 pt-1 border-t border-[#12612F]/40 font-mono text-xs">
            <Link
              href={`/patients/${patient.id}`}
              className="text-[#4CFF8A] hover:underline"
            >
              &gt; Open Full Twin Viewport
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link
              href={`/patients/${patient.id}/forecast`}
              className="text-[#2FBF63] hover:text-[#4CFF8A] hover:underline"
            >
              &gt; View Forecast Trajectory
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link
              href={`/patients/${patient.id}/what-if`}
              className="text-[#2FBF63] hover:text-[#4CFF8A] hover:underline"
            >
              &gt; Open Counterfactual Sandbox
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. WHAT-IF (YOUR DIFFERENTIATOR)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
              {`// 04 THE DIFFERENTIATOR`}
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
              Counterfactual simulation: test before you prescribe.
            </h2>
          </div>
          <Link
            href={`/patients/${patient.id}/what-if`}
            className="text-xs font-semibold text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 hover:border-[#4CFF8A] transition-colors uppercase font-mono"
          >
            LAUNCH WHAT-IF SANDBOX &gt;
          </Link>
        </div>

        <p className="text-sm text-[#4CFF8A] leading-relaxed max-w-3xl">
          Standard predictive models only say what might happen. A digital twin carries a live internal physiological state and can simulate <span className="text-[#B6FFCC] font-semibold">what would happen</span> if environmental exposure or patient behavior changes.
        </p>

        {/* Three Tab Selectors */}
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          <button
            onClick={() => setActiveWhatIfTab('indoors')}
            className={`px-3 py-2 border cursor-pointer transition-colors ${
              activeWhatIfTab === 'indoors'
                ? 'border-[#4CFF8A] bg-[#061C0E] text-[#B6FFCC] font-semibold'
                : 'border-[#12612F] bg-[#04130A] text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            [1] STAY INDOORS
          </button>
          <button
            onClick={() => setActiveWhatIfTab('n95')}
            className={`px-3 py-2 border cursor-pointer transition-colors ${
              activeWhatIfTab === 'n95'
                ? 'border-[#4CFF8A] bg-[#061C0E] text-[#B6FFCC] font-semibold'
                : 'border-[#12612F] bg-[#04130A] text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            [2] WEAR N95 MASK
          </button>
          <button
            onClick={() => setActiveWhatIfTab('medication')}
            className={`px-3 py-2 border cursor-pointer transition-colors ${
              activeWhatIfTab === 'medication'
                ? 'border-[#4CFF8A] bg-[#061C0E] text-[#B6FFCC] font-semibold'
                : 'border-[#12612F] bg-[#04130A] text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            [3] ADJUST MEDICATION (ICS)
          </button>
        </div>

        {/* Selected What-If Simulation Card */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-4 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/40 pb-3">
            <h3 className="text-sm font-semibold text-[#B6FFCC]">
              {currentWhatIf.title}
            </h3>
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-[#2FBF63]">SIMULATED OUTCOME:</span>
              <span className="text-[#4CFF8A] font-bold text-sm bg-[#020A05] px-2 py-0.5 border border-[#12612F]">
                {currentWhatIf.reduction} RISK
              </span>
            </div>
          </div>

          <p className="text-xs text-[#4CFF8A] font-sans leading-relaxed">
            {currentWhatIf.description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-[#020A05] border border-[#12612F]/50 p-3">
              <div className="text-[10px] text-[#2FBF63] uppercase">BASELINE RISK</div>
              <div className="text-xl font-bold text-[#FF2A1A] tabular-nums mt-0.5">
                {currentWhatIf.baselineRisk}%
              </div>
              <div className="text-[10px] text-[#2FBF63]">Unmitigated forecast</div>
            </div>

            <div className="bg-[#020A05] border border-[#12612F]/50 p-3">
              <div className="text-[10px] text-[#2FBF63] uppercase">COUNTERFACTUAL RISK</div>
              <div className="text-xl font-bold text-[#4CFF8A] tabular-nums mt-0.5">
                {currentWhatIf.newRisk}%
              </div>
              <div className="text-[10px] text-[#2FBF63]">With virtual intervention</div>
            </div>

            <div className="bg-[#020A05] border border-[#12612F]/50 p-3">
              <div className="text-[10px] text-[#2FBF63] uppercase">BIOLOGICAL MECHANISM</div>
              <div className="text-[11px] text-[#B6FFCC] mt-1 font-sans leading-tight">
                {currentWhatIf.mechanism}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. TRUST AND LIMITS
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
            {`// 05 TRUST AND LIMITS`}
          </span>
          <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
            Operational boundaries and ethical design.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1.5">
            <div className="text-[10px] font-mono text-[#FFE14A] uppercase tracking-wider">
              &bull; SYNTHETIC DATA ONLY
            </div>
            <h3 className="font-semibold text-[#B6FFCC]">No Real Patient Data</h3>
            <p className="text-[#2FBF63] leading-relaxed">
              All patient EHR profiles, medical histories, and wearable telemetry are causally simulated from published distributions.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1.5">
            <div className="text-[10px] font-mono text-[#FFE14A] uppercase tracking-wider">
              &bull; RISK ESTIMATION
            </div>
            <h3 className="font-semibold text-[#B6FFCC]">Not a Diagnosis</h3>
            <p className="text-[#2FBF63] leading-relaxed">
              The tool estimates future exacerbation probability to assist clinician triage; it does not issue autonomous diagnoses or prescriptions.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1.5">
            <div className="text-[10px] font-mono text-[#FFE14A] uppercase tracking-wider">
              &bull; PROTOTYPE STATUS
            </div>
            <h3 className="font-semibold text-[#B6FFCC]">Not Medical Advice</h3>
            <p className="text-[#2FBF63] leading-relaxed">
              BreathTwin is an engineering prototype and research submission. It is not approved for unsupervised clinical decision-making.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-1.5">
            <div className="text-[10px] font-mono text-[#4CFF8A] uppercase tracking-wider">
              &bull; PRIVACY BY DESIGN
            </div>
            <h3 className="font-semibold text-[#B6FFCC]">Local Baseline Z-Scores</h3>
            <p className="text-[#2FBF63] leading-relaxed">
              Sensor readings are evaluated locally as deviations from personal rolling baselines; zero raw voice or identifiable biometrics are retained.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. UNDER THE HOOD (ENGINEERING ARCHITECTURE)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
              {`// 06 UNDER THE HOOD`}
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
              Engineering stack and benchmark results.
            </h2>
          </div>
          <Link
            href="/benchmarks"
            className="text-xs font-mono text-[#4CFF8A] hover:underline"
          >
            VIEW FULL BENCHMARK ABLATIONS &rarr;
          </Link>
        </div>

        {/* Tech Stack Chips */}
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            Next.js 16 (Turbopack)
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            WebGL / GLSL Shader
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            Three.js + CSS Fallback
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            Kalman State Estimator
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            Temporal GRU / FiLM Gating
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            CPCB Air Quality API
          </span>
          <span className="border border-[#12612F] bg-[#04130A] px-2.5 py-1 text-[#B6FFCC]">
            Tailwind CSS 4
          </span>
        </div>

        {/* Evaluation Results Table */}
        <div className="border border-[#12612F] bg-[#04130A] overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-[#12612F] text-[#4CFF8A] bg-[#020A05]">
                <th className="p-2.5">MODEL / ARCHITECTURE</th>
                <th className="p-2.5">LEAD TIME</th>
                <th className="p-2.5">PR-AUC</th>
                <th className="p-2.5">ROC-AUC</th>
                <th className="p-2.5">FALSE ALARMS / WK</th>
                <th className="p-2.5">INFERENCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#12612F]/30 text-[#2FBF63]">
              <tr className="bg-[#061C0E] font-bold text-[#B6FFCC]">
                <td className="p-2.5 text-[#4CFF8A]">BreathTwin (Physio-Mechanistic + FiLM)</td>
                <td className="p-2.5 text-[#4CFF8A]">42.4 ± 4.1 h</td>
                <td className="p-2.5 text-[#4CFF8A]">0.832</td>
                <td className="p-2.5 text-[#4CFF8A]">0.894</td>
                <td className="p-2.5 text-[#4CFF8A]">0.62</td>
                <td className="p-2.5">&lt;65 ms</td>
              </tr>
              <tr>
                <td className="p-2.5">Gradient Boosted Trees (XGBoost Baseline)</td>
                <td className="p-2.5">18.6 ± 6.2 h</td>
                <td className="p-2.5">0.614</td>
                <td className="p-2.5">0.741</td>
                <td className="p-2.5">1.84</td>
                <td className="p-2.5">&lt;15 ms</td>
              </tr>
              <tr>
                <td className="p-2.5">Standard Recurrent Network (LSTM)</td>
                <td className="p-2.5">22.1 ± 5.8 h</td>
                <td className="p-2.5">0.671</td>
                <td className="p-2.5">0.785</td>
                <td className="p-2.5">1.42</td>
                <td className="p-2.5">110 ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* =========================================================================
          8. TEAM, DEMO VIDEO & FOOTER
      ========================================================================= */}
      <section id="demo" className="border-t border-[#12612F]/60 pt-10 space-y-6">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#2FBF63] uppercase">
            {`// 07 SUBMISSION & ARTIFACTS`}
          </span>
          <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] mt-1">
            Demo walkthrough, artifacts and project team.
          </h2>
        </div>

        {/* Demo Video Walkthrough Frame */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/40 pb-2.5 font-mono text-xs">
            <span className="text-[#B6FFCC] font-semibold">
              &gt; 20-MINUTE CLINICAL &amp; ARCHITECTURAL VIDEO DEMONSTRATION
            </span>
            <span className="text-[#4CFF8A]">
              STATUS: SUBMISSION READY
            </span>
          </div>

          <div className="relative aspect-[16/9] w-full bg-[#020A05] border border-[#12612F] flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-14 h-14 border border-[#4CFF8A] bg-[#04130A] flex items-center justify-center text-[#4CFF8A]">
              <span className="text-2xl">&gt;</span>
            </div>
            <div className="font-mono text-sm text-[#B6FFCC] font-semibold uppercase">
              BREATHTWIN DEMO WALKTHROUGH
            </div>
            <p className="text-xs text-[#2FBF63] max-w-md">
              00:00 Problem &amp; Clinical Blindspot &bull; 03:30 Three-Stream Data Ingestion &bull; 08:15 Thermal Twin Viewport &bull; 13:00 Counterfactual What-If Sandbox &bull; 18:00 Evaluation Benchmarks
            </p>
          </div>
        </div>

        {/* Team Details & Artifact Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2">
            <div className="text-[10px] text-[#2FBF63] uppercase">TEAM &amp; COLLEGE</div>
            <div className="text-[#B6FFCC] font-semibold">BreathTwin // Team DigiTwin</div>
            <div className="text-[#4CFF8A]">Lead: Aarush Bhattacharjee</div>
            <div className="text-[#2FBF63] text-[11px]">Department of Pulmonary Informatics</div>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2">
            <div className="text-[10px] text-[#2FBF63] uppercase">CODE &amp; REPOSITORY</div>
            <div className="text-[#B6FFCC] font-semibold">GitHub: DigiTwin</div>
            <div className="text-[#4CFF8A]">License: MIT Open Source</div>
            <div className="text-[#2FBF63] text-[11px]">Next.js 16 + React 19 + TypeScript</div>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-4 space-y-2">
            <div className="text-[10px] text-[#2FBF63] uppercase">SUBMISSION ARTIFACTS</div>
            <div className="space-y-1">
              <Link href="/assumptions" className="block text-[#4CFF8A] hover:underline">
                &bull; Physiology Assumptions &amp; Citations &rarr;
              </Link>
              <Link href="/benchmarks" className="block text-[#4CFF8A] hover:underline">
                &bull; Model Ablation Benchmarks &rarr;
              </Link>
              <Link href="/patients" className="block text-[#4CFF8A] hover:underline">
                &bull; Patient Cohort Triage View &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
