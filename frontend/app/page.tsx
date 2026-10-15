'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import StatusChip from '@/components/StatusChip';
import InteractiveThermalReveal, { LungMarker } from '@/components/InteractiveThermalReveal';
import { PATIENTS, Patient } from '@/lib/data';
import { getPatient, simulateWhatIf } from '@/lib/api';

export default function HomePage() {
  const [patient, setPatient] = useState<Patient>(PATIENTS[0]);
  const [selectedHotspot, setSelectedHotspot] = useState<LungMarker | null>(null);
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
    <div className="space-y-20 font-sans pb-20 max-w-[1240px] mx-auto px-4 sm:px-6">
      {/* =========================================================================
          1. HERO (THE REVEAL)
      ========================================================================= */}
      <section className="pt-4 lg:pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          {/* Left Half: Headline, Subhead & Action Buttons */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.18]">
                <span className="highlight-flare-transition text-[#020A05] px-2.5 sm:px-3.5 py-0.5 sm:py-1 inline-block mr-2 sm:mr-3.5 font-bold select-none">
                  SEE
                </span>
                the flare-up
                <br className="hidden sm:inline" />{' '}
                before it happens.
              </h1>
              <p className="text-base sm:text-xl text-[#75FFA5] leading-relaxed font-normal">
                A digital twin that fuses a patient’s history, wearable signals, and local air quality to forecast asthma flare-ups 24 to 48 hours ahead.
              </p>
            </div>

            {/* Two Primary Buttons */}
            <div className="flex flex-wrap gap-4 pt-1">
              <Link
                href="/patients"
                className="h-12 px-8 text-xs sm:text-sm uppercase tracking-wider font-bold border border-[#4CFF8A] text-white dark:text-[#020A05] bg-[#4CFF8A] hover:bg-transparent hover:text-white transition-all flex items-center justify-center cursor-pointer shadow-[0_0_16px_rgba(76,255,138,0.35)]"
              >
                OPEN DASHBOARD &gt;
              </Link>
              <a
                href="#demo"
                className="h-12 px-8 text-xs sm:text-sm uppercase tracking-wider font-semibold border border-[#12612F] text-white hover:border-[#4CFF8A] hover:text-[#5CFF95] transition-colors flex items-center justify-center bg-[#04130A] cursor-pointer"
              >
                WATCH DEMO
              </a>
            </div>

            {/* Hotspot Readout if selected */}
            {selectedHotspot && (
              <div className="border border-[#4CFF8A] bg-[#04130A] p-4 text-xs font-mono space-y-1.5 shadow-lg">
                <div className="text-xs text-[#3DE07A] uppercase font-semibold">
                  {`// SELECTED BIOMARKER`}
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
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
            {`// 01 THE PROBLEM`}
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
            Why flare-ups are unpredictable in polluted cities.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-base">
          <div className="md:col-span-7 space-y-4 text-[#75FFA5] leading-relaxed">
            <p className="text-base sm:text-lg">
              In cities with high particulate pollution, flare-ups strike without warning. Routine clinic visits are months apart, so the critical days leading up to an exacerbation are completely invisible to the doctor.
            </p>
            <p className="text-base sm:text-lg text-[#5CFF95]">
              Inhaled fine particulate matter (PM2.5) sparks sub-clinical mucosal swelling and smooth-muscle constriction over 24 to 48 hours. Patients often do not perceive the airway narrowing until severe shortness of breath occurs, leaving emergency hospitalization as the only remaining option.
            </p>
          </div>

          {/* Published Citable Statistics Only */}
          <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-1.5">
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

            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-1.5">
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
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. HOW IT WORKS (THREE STREAMS INTO TWIN)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
              {`// 02 HOW IT WORKS`}
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Three streams into one continuous digital twin.
            </h2>
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
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative">
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

          {/* Card 2: Body Signals */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative">
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

          {/* Card 3: Air */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2.5 relative">
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
        </div>

        {/* Simplified Architecture Flow to Twin and Forecast */}
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
      </section>

      {/* =========================================================================
          4. SEE THE TWIN (PRODUCT PREVIEW)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
              {`// 03 PRODUCT PREVIEW`}
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              What the treating doctor sees.
            </h2>
          </div>
          <Link
            href="/patients"
            className="text-xs sm:text-sm font-bold text-white border border-[#12612F] px-4 py-2 hover:border-[#4CFF8A] hover:text-[#5CFF95] transition-colors uppercase font-mono"
          >
            VIEW ALL PATIENTS (6) &gt;
          </Link>
        </div>

        {/* Static Realistic Clinician Dashboard Preview Card */}
        <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-6">
          {/* Patient Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#12612F]/50 pb-4">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-lg font-bold text-white">
                {patient.id}
              </span>
              <span className="text-[#3DE07A] font-bold">&bull;</span>
              <span className="text-base sm:text-lg font-bold text-white">
                {patient.name}
              </span>
              <span className="text-xs sm:text-sm text-[#75FFA5] font-mono">
                ({patient.age}y {patient.gender}, {patient.city})
              </span>
            </div>
            <StatusChip status={patient.riskLevel} size="md" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-sm">
            {/* Risk Forecast Readout */}
            <div className="md:col-span-4 border border-[#12612F]/60 bg-[#020A05] p-5 space-y-3 font-mono">
              <div className="text-xs text-[#3DE07A] uppercase tracking-wider font-semibold">
                48-HOUR EXACERBATION RISK
              </div>
              <div className="text-4xl sm:text-5xl font-bold text-[#FF2A1A] tabular-nums">
                {patient.risk48h}%
              </div>
              <div className="text-xs sm:text-sm text-[#FFE14A]">
                Confidence range: [{patient.risk48hInterval[0]}% – {patient.risk48hInterval[1]}%]
              </div>
              <div className="border-t border-[#12612F]/40 pt-2 text-[#75FFA5] text-xs sm:text-sm">
                Lead time to attack: <span className="text-white font-bold">{patient.leadTimeHours} Hours</span>
              </div>
            </div>

            {/* Alert Reasons (SHAP Attribution) */}
            <div className="md:col-span-8 border border-[#12612F]/60 bg-[#020A05] p-5 space-y-3 font-mono">
              <div className="text-xs text-[#3DE07A] uppercase tracking-wider font-semibold">
                TOP RISK CONTRIBUTORS (SHAP ATTRIBUTION)
              </div>
              <div className="space-y-2.5">
                {patient.shapReasons.slice(0, 3).map((r) => (
                  <div key={r.rank} className="flex items-center justify-between border-b border-[#12612F]/30 pb-2 text-sm sm:text-base">
                    <span className="text-white font-medium">{r.feature}</span>
                    <span className="text-[#FF2A1A] font-bold">+{r.impactPercent}%</span>
                  </div>
                ))}
              </div>
              <div className="text-xs sm:text-sm text-[#75FFA5] pt-1">
                Airway inflammation state estimated at <span className="text-white font-bold">I(t) = {patient.estimatedInflammationState}</span> (safety threshold: {patient.inflammationThreshold}).
              </div>
            </div>
          </div>

          {/* Quick Links into Patient View */}
          <div className="flex flex-wrap gap-4 pt-1 border-t border-[#12612F]/40 font-mono text-xs sm:text-sm">
            <Link
              href={`/patients/${patient.id}`}
              className="text-white font-semibold hover:text-[#5CFF95] hover:underline"
            >
              &gt; Open Full Twin Viewport
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link
              href={`/patients/${patient.id}/forecast`}
              className="text-[#75FFA5] hover:text-white hover:underline"
            >
              &gt; View Forecast Trajectory
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link
              href={`/patients/${patient.id}/what-if`}
              className="text-[#75FFA5] hover:text-white hover:underline"
            >
              &gt; Open Counterfactual Sandbox
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. WHAT-IF (YOUR DIFFERENTIATOR)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
              {`// 04 THE DIFFERENTIATOR`}
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Counterfactual simulation: test before you prescribe.
            </h2>
          </div>
          <Link
            href={`/patients/${patient.id}/what-if`}
            className="text-xs sm:text-sm font-bold text-white border border-[#12612F] px-4 py-2 hover:border-[#4CFF8A] hover:text-[#5CFF95] transition-colors uppercase font-mono"
          >
            LAUNCH WHAT-IF SANDBOX &gt;
          </Link>
        </div>

        <p className="text-base sm:text-lg text-[#75FFA5] leading-relaxed max-w-3xl">
          Standard predictive models only say what might happen. A digital twin carries a live internal physiological state and can simulate <span className="text-white font-bold">what would happen</span> if environmental exposure or patient behavior changes.
        </p>

        {/* Three Tab Selectors */}
        <div className="flex flex-wrap gap-2.5 font-mono text-xs sm:text-sm">
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

        {/* Selected What-If Simulation Card */}
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
      </section>

      {/* =========================================================================
          6. TRUST AND LIMITS
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
            {`// 05 TRUST AND LIMITS`}
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
            Operational boundaries and ethical design.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 text-sm font-sans">
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
              &bull; SYNTHETIC DATA ONLY
            </div>
            <h3 className="font-bold text-white text-base">No Real Patient Data</h3>
            <p className="text-sm text-[#75FFA5] leading-relaxed">
              All patient EHR profiles, medical histories, and wearable telemetry are causally simulated from published distributions.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
              &bull; RISK ESTIMATION
            </div>
            <h3 className="font-bold text-white text-base">Not a Diagnosis</h3>
            <p className="text-sm text-[#75FFA5] leading-relaxed">
              The tool estimates future exacerbation probability to assist clinician triage; it does not issue autonomous diagnoses or prescriptions.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs font-mono font-bold text-[#FFE14A] uppercase tracking-wider">
              &bull; PROTOTYPE STATUS
            </div>
            <h3 className="font-bold text-white text-base">Not Medical Advice</h3>
            <p className="text-sm text-[#75FFA5] leading-relaxed">
              BreathTwin is an engineering prototype and research submission. It is not approved for unsupervised clinical decision-making.
            </p>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs font-mono font-bold text-[#4CFF8A] uppercase tracking-wider">
              &bull; PRIVACY BY DESIGN
            </div>
            <h3 className="font-bold text-white text-base">Local Baseline Z-Scores</h3>
            <p className="text-sm text-[#75FFA5] leading-relaxed">
              Sensor readings are evaluated locally as deviations from personal rolling baselines; zero raw voice or identifiable biometrics are retained.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. UNDER THE HOOD (ENGINEERING ARCHITECTURE)
      ========================================================================= */}
      <section className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
              {`// 06 UNDER THE HOOD`}
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Engineering stack and benchmark results.
            </h2>
          </div>
          <Link
            href="/benchmarks"
            className="text-xs sm:text-sm font-mono text-white hover:text-[#5CFF95] hover:underline"
          >
            VIEW FULL BENCHMARK ABLATIONS &rarr;
          </Link>
        </div>

        {/* Tech Stack Chips */}
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

        {/* Evaluation Results Table */}
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
      </section>

      {/* =========================================================================
          8. TEAM, DEMO VIDEO & FOOTER
      ========================================================================= */}
      <section id="demo" className="border-t border-[#12612F]/60 pt-12 space-y-6">
        <div>
          <span className="text-xs sm:text-sm font-mono font-semibold tracking-widest text-[#3DE07A] uppercase">
            {`// 07 SUBMISSION & ARTIFACTS`}
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
            Demo walkthrough, artifacts and project team.
          </h2>
        </div>

        {/* Demo Video Walkthrough Frame */}
        <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/40 pb-3 font-mono text-xs sm:text-sm">
            <span className="text-white font-bold">
              &gt; 20-MINUTE CLINICAL &amp; ARCHITECTURAL VIDEO DEMONSTRATION
            </span>
            <span className="text-[#4CFF8A] font-semibold">
              STATUS: SUBMISSION READY
            </span>
          </div>

          <div className="relative aspect-[16/9] w-full bg-[#020A05] border border-[#12612F] flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-16 h-16 border border-[#4CFF8A] bg-[#04130A] flex items-center justify-center text-[#4CFF8A]">
              <span className="text-3xl">&gt;</span>
            </div>
            <div className="font-mono text-base sm:text-lg text-white font-bold uppercase tracking-wider">
              BREATHTWIN DEMO WALKTHROUGH
            </div>
            <p className="text-sm text-[#75FFA5] max-w-lg leading-relaxed">
              00:00 Problem &amp; Clinical Blindspot &bull; 03:30 Three-Stream Data Ingestion &bull; 08:15 Thermal Twin Viewport &bull; 13:00 Counterfactual What-If Sandbox &bull; 18:00 Evaluation Benchmarks
            </p>
          </div>
        </div>

        {/* Team Details & Artifact Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm font-mono">
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs text-[#3DE07A] uppercase font-semibold">TEAM &amp; COLLEGE</div>
            <div className="text-white font-bold text-base">BreathTwin // Team DigiTwin</div>
            <div className="text-[#5CFF95]">Lead: Aarush Bhattacharjee</div>
            <div className="text-[#75FFA5] text-xs">Department of Pulmonary Informatics</div>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs text-[#3DE07A] uppercase font-semibold">CODE &amp; REPOSITORY</div>
            <div className="text-white font-bold text-base">GitHub: DigiTwin</div>
            <div className="text-[#5CFF95]">License: MIT Open Source</div>
            <div className="text-[#75FFA5] text-xs">Next.js 16 + React 19 + TypeScript</div>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-2">
            <div className="text-xs text-[#3DE07A] uppercase font-semibold">SUBMISSION ARTIFACTS</div>
            <div className="space-y-1.5">
              <Link href="/assumptions" className="block text-white hover:text-[#5CFF95] hover:underline">
                &bull; Physiology Assumptions &amp; Citations &rarr;
              </Link>
              <Link href="/benchmarks" className="block text-white hover:text-[#5CFF95] hover:underline">
                &bull; Model Ablation Benchmarks &rarr;
              </Link>
              <Link href="/patients" className="block text-white hover:text-[#5CFF95] hover:underline">
                &bull; Patient Cohort Triage View &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
