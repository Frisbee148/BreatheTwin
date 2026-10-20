'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import InteractiveThermalReveal, { LungMarker } from '@/components/InteractiveThermalReveal';
import ScrambleText from '@/components/ScrambleText';
import AppleReveal from '@/components/AppleReveal';
import MedicalLifeline from '@/components/MedicalLifeline';
import { PATIENTS, Patient } from '@/lib/data';
import { getPatient, simulateWhatIf } from '@/lib/api';

export default function HomePage() {
  const [patient, setPatient] = useState<Patient>(PATIENTS[0]);
  const [selectedHotspot, setSelectedHotspot] = useState<LungMarker | null>(null);
  const [diagramFormat, setDiagramFormat] = useState<'svg' | 'png'>('svg');
  const [activeWhatIfTab, setActiveWhatIfTab] = useState<'indoors' | 'n95' | 'medication'>('indoors');
  const [whatIfResults, setWhatIfResults] = useState<Record<string, { newRisk: number; reduction: string }>>({});

  useEffect(() => {
    let isMounted = true;
    getPatient('PT-8821').then((p) => {
      if (isMounted && p) {
        setPatient(p);

        Promise.all([
          simulateWhatIf({
            patient_id: p.id,
            base_risk_48h: p.risk48h,
            base_inflammation: p.estimatedInflammationState,
            current_pm25: p.currentAirQuality.pm25,
            current_adherence_pct: p.controllerAdherence,
            outdoor_hours: 0.5,
            wear_n95: false,
            hepa_purifier: true,
          }),
          simulateWhatIf({
            patient_id: p.id,
            base_risk_48h: p.risk48h,
            base_inflammation: p.estimatedInflammationState,
            current_pm25: p.currentAirQuality.pm25,
            current_adherence_pct: p.controllerAdherence,
            outdoor_hours: 1.5,
            wear_n95: true,
            hepa_purifier: false,
          }),
          simulateWhatIf({
            patient_id: p.id,
            base_risk_48h: p.risk48h,
            base_inflammation: p.estimatedInflammationState,
            current_pm25: p.currentAirQuality.pm25,
            current_adherence_pct: p.controllerAdherence,
            outdoor_hours: 2.5,
            wear_n95: false,
            target_adherence_pct: 100.0,
            hepa_purifier: false,
          }),
        ]).then(([rIndoors, rN95, rMed]) => {
          if (isMounted) {
            setWhatIfResults({
              indoors: {
                newRisk: rIndoors.simulatedRisk,
                reduction: `${rIndoors.riskDelta > 0 ? '+' : ''}${rIndoors.riskDelta}%`,
              },
              n95: {
                newRisk: rN95.simulatedRisk,
                reduction: `${rN95.riskDelta > 0 ? '+' : ''}${rN95.riskDelta}%`,
              },
              medication: {
                newRisk: rMed.simulatedRisk,
                reduction: `${rMed.riskDelta > 0 ? '+' : ''}${rMed.riskDelta}%`,
              },
            });
          }
        });
      }
    });
    return () => { isMounted = false; };
  }, []);

  const whatIfExamples = {
    indoors: {
      title: 'Intervention 01: Stay Indoors During Smog Surge',
      description: 'Patient shifts work indoors with high-efficiency air filtering, reducing inhaled ambient PM2.5 exposure by 65%.',
      baselineRisk: patient.risk48h,
      newRisk: whatIfResults.indoors?.newRisk ?? 46,
      reduction: whatIfResults.indoors?.reduction ?? '-36%',
      mechanism: 'Blunts particulate alveolar deposition rate a · Dose_PM(t), arresting rapid mucosal swelling.'
    },
    n95: {
      title: 'Intervention 02: Wear N95 Mask During Commute',
      description: 'Patient equips a sealed N95 respirator during the 90-minute evening commute along heavy arterial roads in Delhi.',
      baselineRisk: patient.risk48h,
      newRisk: whatIfResults.n95?.newRisk ?? 54,
      reduction: whatIfResults.n95?.reduction ?? '-28%',
      mechanism: 'Filters 95% of fine particulate matter during peak traffic hours, preventing the trigger threshold crossing.'
    },
    medication: {
      title: 'Intervention 03: Proactive ICS Controller Dose Step-Up',
      description: 'Pulmonologist advises doubling the inhaled corticosteroid (budesonide/formoterol) maintenance regimen 36h ahead.',
      baselineRisk: patient.risk48h,
      newRisk: whatIfResults.medication?.newRisk ?? 32,
      reduction: whatIfResults.medication?.reduction ?? '-50%',
      mechanism: 'Accelerates mucosal recovery decay rate c · Controller(t), preventing acute smooth muscle hyper-reactivity.'
    }
  };

  const currentWhatIf = whatIfExamples[activeWhatIfTab];

  return (
    <div className="relative min-h-screen">
      {/* Medical Vector Lifeline Background (Only on Home Page) */}
      <MedicalLifeline />

      <div className="relative z-10 space-y-20 font-sans pb-20 max-w-[1240px] mx-auto px-4 sm:px-6">
      {/* =========================================================================
          1. HERO (THE REVEAL)
      ========================================================================= */}
      <section className="pt-4 lg:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          {/* Left Half: Headline, Subhead & Action Buttons */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-4">
              <AppleReveal duration={1000} delay={100}>
                <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.18]">
                  <span className="highlight-flare-transition text-[#020A05] px-2.5 sm:px-3.5 py-0.5 sm:py-1 inline-block mr-2 sm:mr-3.5 font-bold select-none">
                    SEE
                  </span>
                  the flare-up
                  <br className="hidden sm:inline" />{' '}
                  before it happens.
                </h1>
              </AppleReveal>
              <AppleReveal duration={1000} delay={250}>
                <p className="text-base sm:text-xl text-[#75FFA5] leading-relaxed font-normal">
                  A digital twin that fuses a patient’s history, wearable signals, and local air quality to forecast asthma flare-ups 24 to 48 hours ahead.
                </p>
              </AppleReveal>
            </div>

            {/* Action Buttons */}
            <AppleReveal duration={1000} delay={380}>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex h-12 px-8 text-xs sm:text-sm uppercase tracking-wider font-bold border border-[#4CFF8A] text-white dark:text-[#020A05] bg-[#4CFF8A] hover:bg-transparent hover:text-white transition-all items-center justify-center cursor-pointer shadow-[0_0_16px_rgba(76,255,138,0.35)]"
                >
                  GO TO LOGIN &rarr;
                </Link>
                <a
                  href="#demo"
                  className="inline-flex h-12 px-6 text-xs sm:text-sm uppercase tracking-wider font-bold border border-[#12612F] text-[#4CFF8A] bg-[#04130A] hover:border-[#4CFF8A] hover:text-white transition-all items-center justify-center cursor-pointer"
                >
                  WATCH DEMO VIDEO (20 MIN) &darr;
                </a>
              </div>
            </AppleReveal>

            {/* Hotspot Readout if selected */}
            {selectedHotspot && (
              <div className="border border-[#4CFF8A] bg-[#04130A] p-4 text-xs font-mono space-y-1.5 shadow-lg">
                <div className="text-xs text-[#3DE07A] uppercase font-semibold">
                  {`◈ SELECTED BIOMARKER`}
                </div>
                <div className="text-sm font-bold text-white">
                  {selectedHotspot.name}: <span className="text-[#FF2A1A]">{selectedHotspot.value}</span>
                </div>
                <p className="text-xs sm:text-[13px] text-[#75FFA5] font-sans leading-relaxed">
                  {selectedHotspot.description}
                </p>
              </div>
            )}
          </div>

          {/* Right Half: Interactive Thermal Torso & Lungs Reveal */}
          <div className="lg:col-span-6 flex justify-center">
            <AppleReveal duration={1100} delay={200} className="w-full flex justify-center">
              <InteractiveThermalReveal
                bodySrc="/images/body.webp"
                lungsSrc="/images/lungs.webp"
                patientId={patient.id}
                onMarkerSelect={setSelectedHotspot}
              />
            </AppleReveal>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. THE PROBLEM (THE CLINICAL BLINDSPOT)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <ScrambleText
            text="01 — THE PROBLEM"
            prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
            className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
          />
          <AppleReveal delay={80} duration={1000}>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Why flare-ups are unpredictable in polluted cities.
            </h2>
          </AppleReveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-base">
          <AppleReveal delay={160} duration={1000} className="md:col-span-7 space-y-4 text-[#75FFA5] leading-relaxed">
            <p className="text-base sm:text-lg">
              In cities with high particulate pollution, flare-ups strike without warning. Routine clinic visits are months apart, so the critical days leading up to an exacerbation are completely invisible to the doctor.
            </p>
            <p className="text-base sm:text-lg text-[#5CFF95]">
              Inhaled fine particulate matter (PM2.5) sparks sub-clinical mucosal swelling and smooth-muscle constriction over 24 to 48 hours. Patients often do not perceive the airway narrowing until severe shortness of breath occurs, leaving emergency hospitalization as the only remaining option.
            </p>
          </AppleReveal>

          {/* Published Citable Statistics Only */}
          <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AppleReveal delay={240} duration={1000} className="h-full">
              <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-1.5 h-full">
                <div className="text-3xl sm:text-4xl font-bold font-mono text-[#FF2A1A] tabular-nums">
                  &gt;42%
                </div>
                <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                  GLOBAL ASTHMA MORTALITY
                </div>
                <p className="text-xs sm:text-sm text-[#75FFA5] leading-relaxed pt-1">
                  India accounts for over 42% of global asthma deaths despite having approximately 13% of global asthma burden (Lancet Global Health).
                </p>
              </div>
            </AppleReveal>

            <AppleReveal delay={360} duration={1000} className="h-full">
              <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-1.5 h-full">
                <div className="text-3xl sm:text-4xl font-bold font-mono text-white tabular-nums">
                  24–36h
                </div>
                <div className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                  INFLAMMATORY LAG
                </div>
                <p className="text-xs sm:text-sm text-[#75FFA5] leading-relaxed pt-1">
                  Documented physiological window between initial inflammatory cascade onset and patient self-perception of dyspnea.
                </p>
              </div>
            </AppleReveal>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. HOW IT WORKS (THREE STREAMS INTO TWIN)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <ScrambleText
              text="02 — HOW IT WORKS"
              prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
            />
            <AppleReveal delay={80} duration={1000}>
              <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
                Three streams into one continuous digital twin.
              </h2>
            </AppleReveal>
          </div>
          <Link
            href="/assumptions"
            className="text-xs sm:text-sm font-mono text-white hover:text-[#5CFF95] hover:underline"
          >
            AUDIT PHYSIOLOGY ASSUMPTIONS &rarr;
          </Link>
        </div>

        {/* Three Stream Flow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: History */}
          <AppleReveal delay={120} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#3DE07A] uppercase tracking-wider">
                  STREAM 01 &bull; STATIC
                </span>
                <span className="text-xs font-mono font-bold border border-[#12612F] px-2 py-0.5 text-white bg-[#020A05]">
                  EHR
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Patient History
              </h3>
              <p className="text-sm sm:text-base text-[#75FFA5] leading-relaxed">
                Calibrated spirometry (FEV1, FVC), clinical asthma phenotype, prescribed controller steroids, and past exacerbation frequency.
              </p>
            </div>
          </AppleReveal>

          {/* Card 2: Body Signals */}
          <AppleReveal delay={240} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#3DE07A] uppercase tracking-wider">
                  STREAM 02 &bull; WEARABLE
                </span>
                <span className="text-xs font-mono font-bold border border-[#12612F] px-2 py-0.5 text-white bg-[#020A05]">
                  SENSORS
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Body Signals
              </h3>
              <p className="text-sm sm:text-base text-[#75FFA5] leading-relaxed">
                Continuous resting respiratory rate, nocturnal SpO2 dips, resting heart rate, HRV rMSSD, sleep fragmentation, and rescue inhaler logs.
              </p>
            </div>
          </AppleReveal>

          {/* Card 3: Air */}
          <AppleReveal delay={360} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#3DE07A] uppercase tracking-wider">
                  STREAM 03 &bull; ENVIRONMENT
                </span>
                <span className="text-xs font-mono font-bold border border-[#12612F] px-2 py-0.5 text-white bg-[#020A05]">
                  CPCB / AQI
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Local Air Quality
              </h3>
              <p className="text-sm sm:text-base text-[#75FFA5] leading-relaxed">
                Real-time monitoring stations in Delhi, Mumbai, and Bengaluru: ambient PM2.5, PM10, temperature inversions, and humidity.
              </p>
            </div>
          </AppleReveal>
        </div>

        {/* Simplified Architecture Flow to Twin and Forecast */}
        <AppleReveal delay={200} duration={1050}>
          <div className="border border-[#12612F] bg-[#020A05] p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center font-mono text-xs sm:text-sm">
            <div className="md:col-span-5 border-l-2 border-[#4CFF8A] pl-4 py-1 space-y-1">
              <div className="text-[11px] text-[#3DE07A] uppercase font-semibold">FUSION PIPELINE</div>
              <div className="text-white font-bold text-base">Twin Core (Latent State Estimator)</div>
              <div className="text-[#75FFA5] text-xs sm:text-sm font-sans leading-relaxed">
                Filters input streams through differential equation dI/dt to estimate mucosal inflammation state.
              </div>
            </div>

            <div className="hidden md:flex md:col-span-2 justify-center text-white text-2xl font-bold">
              &rarr;
            </div>

            <div className="md:col-span-5 border-l-2 border-[#FFE14A] pl-4 py-1 space-y-1">
              <div className="text-[11px] text-[#3DE07A] uppercase font-semibold">ACTIONABLE OUTCOME</div>
              <div className="text-white font-bold text-base">24–48h Flare-Up Forecast</div>
              <div className="text-[#75FFA5] text-xs sm:text-sm font-sans leading-relaxed">
                Conformal risk probability + ranked SHAP reasons + counterfactual what-if response.
              </div>
            </div>
          </div>
        </AppleReveal>
      </section>

      {/* =========================================================================
          4. SYSTEM & CODEBASE ARCHITECTURE (REPLACES PRODUCT PREVIEW)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <ScrambleText
              text="03 — SYSTEM ARCHITECTURE"
              prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
            />
            <AppleReveal delay={80} duration={1000}>
              <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
                Multimodal system architecture.
              </h2>
            </AppleReveal>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs sm:text-sm">
            <a
              href="/docs/Architecture_Diagram_v2.pdf?v=20261020"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#020A05] bg-[#4CFF8A] border border-[#4CFF8A] px-4 py-2 hover:bg-transparent hover:text-white transition-colors uppercase"
            >
              DOWNLOAD ARCHITECTURE PDF &rarr;
            </a>
            <Link
              href="/login"
              className="font-bold text-white border border-[#12612F] px-4 py-2 hover:border-[#4CFF8A] hover:text-[#5CFF95] transition-colors uppercase"
            >
              OPEN COHORT TRIAGE &gt;
            </Link>
          </div>
        </div>

        {/* Full PlantUML System Architecture Diagram (Light Mode Standard) */}
        <AppleReveal delay={150} duration={1050}>
          <div className="border border-[#12612F] bg-[#04130A] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/50 pb-3 font-mono text-xs sm:text-sm">
              <span className="text-white font-bold">
                &gt; PLANTUML MULTIMODAL SYSTEM ARCHITECTURE DIAGRAM (LIGHT SPEC)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[#FFE14A]">
                  HELD-OUT TEST ROC-AUC: 24H = 0.9399 | 48H = 0.9428
                </span>
                <div className="inline-flex border border-[#12612F] rounded text-[11px] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDiagramFormat('svg')}
                    className={`px-3 py-1 font-mono transition-colors ${
                      diagramFormat === 'svg'
                        ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                        : 'bg-[#020A05] text-[#75FFA5] hover:text-white'
                    }`}
                  >
                    VECTOR SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiagramFormat('png')}
                    className={`px-3 py-1 font-mono transition-colors ${
                      diagramFormat === 'png'
                        ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                        : 'bg-[#020A05] text-[#75FFA5] hover:text-white'
                    }`}
                  >
                    HIGH-RES PNG
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full overflow-x-auto bg-white border border-[#CBD5E1] p-3 sm:p-5 rounded-sm shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={diagramFormat}
                src={
                  diagramFormat === 'svg'
                    ? '/architecture-diagram-v2.svg?v=20261020-v3'
                    : '/architecture-diagram-v2.png?v=20261020-v3'
                }
                alt="BreathTwin Multimodal System Architecture Diagram"
                className="w-full h-auto min-w-[840px] block mx-auto"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-[#75FFA5]">
              <span>
                Arrows: <span className="text-[#4CFF8A] font-bold">Green</span> = Telemetry Ingestion/UI • <span className="text-[#38BDF8] font-bold">Blue</span> = ML Predictions • <span className="text-[#FBBF24] font-bold">Orange</span> = ODE Simulator • <span className="text-[#C084FC] font-bold">Purple</span> = LLM Pipeline
              </span>
              <div className="flex gap-3">
                <a
                  href="/architecture-diagram-v2.svg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white underline"
                >
                  Open SVG in new tab &rarr;
                </a>
                <a
                  href="/architecture-diagram-v2.png"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white underline"
                >
                  Open PNG in new tab &rarr;
                </a>
              </div>
            </div>
          </div>
        </AppleReveal>
      </section>

      {/* =========================================================================
          5. WHAT-IF (YOUR DIFFERENTIATOR)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <ScrambleText
              text="04 — THE DIFFERENTIATOR"
              prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
            />
            <AppleReveal delay={80} duration={1000}>
              <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
                Counterfactual simulation: test before you prescribe.
              </h2>
            </AppleReveal>
          </div>
          <Link
            href={`/patients/${patient.id}/what-if`}
            className="text-xs sm:text-sm font-bold text-white border border-[#12612F] px-4 py-2 hover:border-[#4CFF8A] hover:text-[#5CFF95] transition-colors uppercase font-mono"
          >
            LAUNCH WHAT-IF SANDBOX &gt;
          </Link>
        </div>

        <AppleReveal delay={140} duration={950}>
          <p className="text-base sm:text-lg text-[#75FFA5] leading-relaxed max-w-3xl">
            Standard predictive models only say what might happen. A digital twin carries a live internal physiological state and can simulate <span className="text-white font-bold">what would happen</span> if environmental exposure or patient behavior changes.
          </p>

          {/* Three Tab Selectors */}
          <div className="flex flex-wrap gap-2.5 font-mono text-xs sm:text-sm mt-6">
            <button
              onClick={() => setActiveWhatIfTab('indoors')}
              className={`px-4 py-2.5 border cursor-pointer transition-colors ${
                activeWhatIfTab === 'indoors'
                  ? 'border-[#4CFF8A] bg-[#061C0E] text-white font-bold'
                  : 'border-[#12612F] bg-[#04130A] text-[#75FFA5] hover:text-white'
              }`}
            >
              [1] STAY INDOORS
            </button>
            <button
              onClick={() => setActiveWhatIfTab('n95')}
              className={`px-4 py-2.5 border cursor-pointer transition-colors ${
                activeWhatIfTab === 'n95'
                  ? 'border-[#4CFF8A] bg-[#061C0E] text-white font-bold'
                  : 'border-[#12612F] bg-[#04130A] text-[#75FFA5] hover:text-white'
              }`}
            >
              [2] WEAR N95 MASK
            </button>
            <button
              onClick={() => setActiveWhatIfTab('medication')}
              className={`px-4 py-2.5 border cursor-pointer transition-colors ${
                activeWhatIfTab === 'medication'
                  ? 'border-[#4CFF8A] bg-[#061C0E] text-white font-bold'
                  : 'border-[#12612F] bg-[#04130A] text-[#75FFA5] hover:text-white'
              }`}
            >
              [3] ADJUST MEDICATION (ICS)
            </button>
          </div>
        </AppleReveal>

        {/* Selected What-If Simulation Card */}
        <AppleReveal delay={240} duration={1050}>
          <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-5 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/40 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-white">
                {currentWhatIf.title}
              </h3>
              <div className="flex items-center space-x-3 text-xs sm:text-sm">
                <span className="text-[#3DE07A]">SIMULATED OUTCOME:</span>
                <span className="text-white font-bold text-sm sm:text-base bg-[#020A05] px-2.5 py-1 border border-[#4CFF8A]">
                  {currentWhatIf.reduction} RISK
                </span>
              </div>
            </div>

            <p className="text-sm sm:text-base text-[#75FFA5] font-sans leading-relaxed">
              {currentWhatIf.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm pt-1">
              <div className="bg-[#020A05] border border-[#12612F]/50 p-4">
                <div className="text-xs text-[#3DE07A] uppercase font-semibold">BASELINE RISK</div>
                <div className="text-2xl sm:text-3xl font-bold text-[#FF2A1A] tabular-nums mt-1">
                  {currentWhatIf.baselineRisk}%
                </div>
                <div className="text-xs text-[#75FFA5] mt-0.5">Unmitigated forecast</div>
              </div>

              <div className="bg-[#020A05] border border-[#12612F]/50 p-4">
                <div className="text-xs text-[#3DE07A] uppercase font-semibold">COUNTERFACTUAL RISK</div>
                <div className="text-2xl sm:text-3xl font-bold text-[#4CFF8A] tabular-nums mt-1">
                  {currentWhatIf.newRisk}%
                </div>
                <div className="text-xs text-[#75FFA5] mt-0.5">With virtual intervention</div>
              </div>

              <div className="bg-[#020A05] border border-[#12612F]/50 p-4">
                <div className="text-xs text-[#3DE07A] uppercase font-semibold">BIOLOGICAL MECHANISM</div>
                <div className="text-xs sm:text-sm text-white mt-1 font-sans leading-relaxed">
                  {currentWhatIf.mechanism}
                </div>
              </div>
            </div>
          </div>
        </AppleReveal>
      </section>

      {/* =========================================================================
          6. TRUST AND LIMITS
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <ScrambleText
            text="05 — TRUST AND LIMITS"
            prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
            className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
          />
          <AppleReveal delay={80} duration={1000}>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Operational boundaries and ethical design.
            </h2>
          </AppleReveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 text-sm font-sans">
          <AppleReveal delay={100} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
                &bull; SYNTHETIC DATA ONLY
              </div>
              <h3 className="font-bold text-white text-base">No Real Patient Data</h3>
              <p className="text-sm text-[#75FFA5] leading-relaxed">
                All patient EHR profiles, medical histories, and wearable telemetry are causally simulated from published distributions.
              </p>
            </div>
          </AppleReveal>

          <AppleReveal delay={200} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
                &bull; RISK ESTIMATION
              </div>
              <h3 className="font-bold text-white text-base">Not a Diagnosis</h3>
              <p className="text-sm text-[#75FFA5] leading-relaxed">
                The tool estimates future exacerbation probability to assist clinician triage; it does not issue autonomous diagnoses or prescriptions.
              </p>
            </div>
          </AppleReveal>

          <AppleReveal delay={300} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
                &bull; PROTOTYPE STATUS
              </div>
              <h3 className="font-bold text-white text-base">Not Medical Advice</h3>
              <p className="text-sm text-[#75FFA5] leading-relaxed">
                BreathTwin is an engineering prototype and research submission. It is not approved for unsupervised clinical decision-making.
              </p>
            </div>
          </AppleReveal>

          <AppleReveal delay={400} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs font-mono font-bold text-[#4CFF8A] uppercase tracking-wider">
                &bull; PRIVACY BY DESIGN
              </div>
              <h3 className="font-bold text-white text-base">Local Baseline Z-Scores</h3>
              <p className="text-sm text-[#75FFA5] leading-relaxed">
                Sensor readings are evaluated locally as deviations from personal rolling baselines; zero raw voice or identifiable biometrics are retained.
              </p>
            </div>
          </AppleReveal>
        </div>
      </section>

      {/* =========================================================================
          7. UNDER THE HOOD (ENGINEERING ARCHITECTURE)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <ScrambleText
              text="06 — UNDER THE HOOD"
              prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
            />
            <AppleReveal delay={80} duration={1000}>
              <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
                Engineering stack and benchmark results.
              </h2>
            </AppleReveal>
          </div>
          <Link
            href="/benchmarks"
            className="text-xs sm:text-sm font-mono text-white hover:text-[#5CFF95] hover:underline"
          >
            VIEW FULL BENCHMARK ABLATIONS &rarr;
          </Link>
        </div>

        {/* Tech Stack Chips */}
        <AppleReveal delay={120} duration={950}>
          <div className="flex flex-wrap gap-2.5 font-mono text-xs sm:text-sm">
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              Next.js 16 (Turbopack)
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              WebGL / GLSL Shader
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              Three.js + CSS Fallback
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              Kalman State Estimator
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              Temporal GRU / FiLM Gating
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              CPCB Air Quality API
            </span>
            <span className="border border-[#12612F] bg-[#04130A] px-3 py-1.5 text-white font-medium">
              Tailwind CSS 4
            </span>
          </div>
        </AppleReveal>

        {/* Evaluation Results Table */}
        <AppleReveal delay={220} duration={1050}>
          <div className="border border-[#12612F] bg-[#04130A] overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm font-mono border-collapse">
              <thead>
                <tr className="border-b border-[#12612F] text-white bg-[#020A05]">
                  <th className="p-3">MODEL / ARCHITECTURE</th>
                  <th className="p-3">LEAD TIME</th>
                  <th className="p-3">PR-AUC</th>
                  <th className="p-3">ROC-AUC</th>
                  <th className="p-3">FALSE ALARMS / WK</th>
                  <th className="p-3">INFERENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12612F]/30 text-[#75FFA5]">
                <tr className="bg-[#061C0E] font-bold text-white">
                  <td className="p-3 text-white">BreathTwin (Physio-Mechanistic + FiLM)</td>
                  <td className="p-3 text-[#4CFF8A]">42.4 ± 4.1 h</td>
                  <td className="p-3 text-[#4CFF8A]">0.832</td>
                  <td className="p-3 text-[#4CFF8A]">0.894</td>
                  <td className="p-3 text-[#4CFF8A]">0.62</td>
                  <td className="p-3">&lt;65 ms</td>
                </tr>
                <tr>
                  <td className="p-3 text-white">Gradient Boosted Trees (XGBoost Baseline)</td>
                  <td className="p-3">18.6 ± 6.2 h</td>
                  <td className="p-3">0.614</td>
                  <td className="p-3">0.741</td>
                  <td className="p-3">1.84</td>
                  <td className="p-3">&lt;15 ms</td>
                </tr>
                <tr>
                  <td className="p-3 text-white">Standard Recurrent Network (LSTM)</td>
                  <td className="p-3">22.1 ± 5.8 h</td>
                  <td className="p-3">0.671</td>
                  <td className="p-3">0.785</td>
                  <td className="p-3">1.42</td>
                  <td className="p-3">110 ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppleReveal>
      </section>

      {/* =========================================================================
          8. TEAM, DEMO VIDEO & FOOTER
      ========================================================================= */}
      <section id="demo" className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <ScrambleText
            text="07 — SUBMISSION & ARTIFACTS"
            prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
            className="text-xs sm:text-sm font-semibold tracking-widest text-[#3DE07A] uppercase"
          />
          <AppleReveal delay={80} duration={1000}>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Demo walkthrough, artifacts and project team.
            </h2>
          </AppleReveal>
        </div>

        {/* Demo Video Walkthrough Frame */}
        <AppleReveal delay={150} duration={1050}>
          <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/40 pb-3 font-mono text-xs sm:text-sm">
              <span className="text-white font-bold">
                &gt; 20-MINUTE CLINICAL &amp; ARCHITECTURAL VIDEO DEMONSTRATION
              </span>
              <a
                href="https://youtu.be/S4WMAG_yx4Y"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4CFF8A] hover:underline font-semibold flex items-center gap-1"
              >
                OPEN ON YOUTUBE &rarr;
              </a>
            </div>

            <div className="relative aspect-[16/9] w-full bg-[#020A05] border border-[#12612F] overflow-hidden">
              <iframe
                className="w-full h-full border-0"
                src="https://www.youtube-nocookie.com/embed/S4WMAG_yx4Y?rel=0"
                title="BreathTwin 20-Minute Clinical & Architectural Video Demonstration"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 font-mono text-xs text-[#75FFA5]">
              <div>
                <span className="text-white font-bold">DIRECT LINK:</span>{' '}
                <a
                  href="https://youtu.be/S4WMAG_yx4Y"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4CFF8A] hover:underline underline-offset-2"
                >
                  https://youtu.be/S4WMAG_yx4Y
                </a>
              </div>
              <div className="text-[#3DE07A]">
                UNLISTED SUBMISSION DEMO &bull; 15–20 MINUTES
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#75FFA5] leading-relaxed border-t border-[#12612F]/40 pt-3 font-mono">
              <span className="text-white font-bold">Chapters:</span> 00:00 Problem &amp; Clinical Blindspot &bull; 03:30 Three-Stream Data Ingestion &bull; 08:15 Thermal Twin Viewport &bull; 13:00 Counterfactual What-If Sandbox &bull; 18:00 Evaluation Benchmarks
            </p>
          </div>
        </AppleReveal>

        {/* Team Details & Artifact Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm font-mono">
          <AppleReveal delay={100} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs text-[#3DE07A] uppercase font-semibold">TEAM &amp; COLLEGE</div>
              <div className="text-white font-bold text-base">BreathTwin &bull; ABAY_LNMIIT/NSUT</div>
              <div className="text-[#5CFF95]">Lead: Aarush Bhattacharjee / Frisbee148 (LNMIIT)</div>
              <div className="text-[#75FFA5] text-xs">ML: Rakshit Gupta / Hobbiskar21 (NSUT)</div>
            </div>
          </AppleReveal>

          <AppleReveal delay={220} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs text-[#3DE07A] uppercase font-semibold">CODE &amp; REPOSITORY</div>
              <div className="text-white font-bold text-base">GitHub: BreatheTwin</div>
              <div className="text-[#5CFF95]">License: MIT Open Source</div>
              <div className="text-[#75FFA5] text-xs">Next.js 16 + React 19 + TypeScript</div>
            </div>
          </AppleReveal>

          <AppleReveal delay={340} duration={1000} className="h-full">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2 h-full">
              <div className="text-xs text-[#3DE07A] uppercase font-semibold">SUBMISSION ARTIFACTS</div>
              <div className="space-y-1.5">
                <a href="https://youtu.be/S4WMAG_yx4Y" target="_blank" rel="noopener noreferrer" className="block text-[#4CFF8A] hover:underline font-bold">
                  &bull; 20-Min Demo Video (YouTube) &rarr;
                </a>
                <a href="/docs/Architecture_Diagram_v2.pdf?v=20261020" target="_blank" rel="noopener noreferrer" className="block text-white hover:text-[#5CFF95] hover:underline">
                  &bull; Architecture Diagram (PDF) &rarr;
                </a>
                <a href="/docs/Project_Presentation.pdf" target="_blank" rel="noopener noreferrer" className="block text-white hover:text-[#5CFF95] hover:underline">
                  &bull; Project Presentation &amp; Outcomes (PDF) &rarr;
                </a>
                <Link href="/assumptions" className="block text-white hover:text-[#5CFF95] hover:underline">
                  &bull; Physiology Assumptions &amp; Citations &rarr;
                </Link>
                <Link href="/benchmarks" className="block text-white hover:text-[#5CFF95] hover:underline">
                  &bull; Model Ablation Benchmarks &rarr;
                </Link>
              </div>
            </div>
          </AppleReveal>
        </div>
      </section>
      </div>
    </div>
  );
}
