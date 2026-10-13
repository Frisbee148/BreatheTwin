'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PATIENTS } from '@/lib/data';
import PatientNavHeader from '@/components/PatientNavHeader';
import StatusChip from '@/components/StatusChip';

export default function PatientWhatIfPage() {
  const params = useParams();
  const patientId = params?.id as string;
  const patient = PATIENTS.find(p => p.id === patientId) || PATIENTS[0];

  // Counterfactual Sandbox Interactive States
  const [outdoorHours, setOutdoorHours] = useState<number>(2.5);
  const [wearN95, setWearN95] = useState<boolean>(false);
  const [targetAdherence, setTargetAdherence] = useState<number>(patient.controllerAdherence);
  const [hepaPurifier, setHepaPurifier] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Dynamic simulation model calculation based on latent differential equation dI/dt
  // Base risk
  const baseRisk = patient.risk48h;
  
  // Modifiers
  const outdoorReduction = Math.max(0, (2.5 - outdoorHours) * 7.5); // reducing outdoor hours lowers risk
  const n95Reduction = wearN95 ? 18 : 0; // N95 mask filters 95% of ambient particulates
  const adherenceDiff = targetAdherence - patient.controllerAdherence;
  const adherenceReduction = (adherenceDiff / 100) * 22; // improved controller adherence suppresses NF-kB
  const hepaReduction = hepaPurifier ? 8 : 0; // indoor air filtration

  const totalReduction = Math.round(outdoorReduction + n95Reduction + adherenceReduction + hepaReduction);
  const simulatedRisk = Math.max(12, Math.min(99, baseRisk - totalReduction));
  const riskDelta = simulatedRisk - baseRisk;

  const simulatedInflammation = Math.max(
    0.20,
    patient.estimatedInflammationState - (totalReduction / 100) * 0.45
  );

  const simulatedStatus = 
    simulatedRisk >= 70 ? 'HIGH RISK' :
    simulatedRisk >= 60 ? 'ELEVATED' :
    simulatedRisk >= 40 ? 'CAUTION' : 'NORMAL';

  const handleSimulate = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
    }, 400);
  };

  const handleReset = () => {
    setOutdoorHours(2.5);
    setWearN95(false);
    setTargetAdherence(patient.controllerAdherence);
    setHepaPurifier(false);
  };

  return (
    <div className="space-y-6">
      {/* Patient Vital Navigation Header & Tabs */}
      <PatientNavHeader patient={patient} />

      {/* Header Info */}
      <div className="border border-[#12612F] bg-[#04130A] p-4 text-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// COUNTERFACTUAL WHAT-IF INTERVENTION SANDBOX`}</span>
          <div className="text-xs text-[#B6FFCC] font-mono mt-0.5">
            MECHANISM: LATENT STATE PERTURBATION &bull; SECTION 9 FORECAST RE-SCORING
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleReset}
            className="text-xs uppercase tracking-wider text-[#2FBF63] hover:text-[#4CFF8A] underline"
          >
            RESET TO BASELINE
          </button>
          <span className="text-[#12612F]">|</span>
          <span className="text-[10px] font-mono text-[#FFE14A]">
            LATENCY: &lt;400ms IN-MEMORY REPLAY
          </span>
        </div>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Controls and Sliders */}
        <div className="lg:col-span-7 border border-[#12612F] bg-[#04130A] p-5 space-y-6 text-xs">
          <div className="border-b border-[#12612F]/40 pb-3 flex justify-between items-center">
            <span className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider">
              1. ADJUST CLINICAL INTERVENTIONS
            </span>
            <span className="text-[10px] text-[#2FBF63] font-mono">
              TARGET PATIENT: {patient.name}
            </span>
          </div>

          {/* Slider 1: Outdoor Exposure Hours */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="outdoor-hours-slider" className="text-xs text-[#B6FFCC] uppercase font-medium">
                DAILY OUTDOOR TIME (COMMUTE &amp; WORK)
              </label>
              <span className="font-mono text-sm text-[#4CFF8A] font-bold">
                {outdoorHours.toFixed(1)} <span className="text-[10px] text-[#2FBF63]">HOURS/DAY</span>
              </span>
            </div>
            <input
              id="outdoor-hours-slider"
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={outdoorHours}
              onChange={(e) => {
                setOutdoorHours(parseFloat(e.target.value));
                handleSimulate();
              }}
              className="w-full accent-[#4CFF8A] bg-[#061C0E] h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#2FBF63] font-mono">
              <span>0.0h (STAY INDOORS)</span>
              <span>2.5h (NORMAL COMMUTE)</span>
              <span>6.0h (HEAVY EXPOSURE)</span>
            </div>
          </div>

          {/* Toggle 2: N95 Respirator */}
          <div className="border border-[#12612F] bg-[#061C0E] p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[#B6FFCC] uppercase">
                WEAR N95 PARTICULATE RESPIRATOR DURING COMMUTE
              </div>
              <p className="text-[11px] text-[#2FBF63] mt-0.5">
                Reduces ambient PM2.5 inhaled concentration by 95% (NIOSH certification coefficient).
              </p>
            </div>
            <button
              onClick={() => {
                setWearN95(prev => !prev);
                handleSimulate();
              }}
              className={`h-9 px-4 text-xs font-mono font-semibold uppercase tracking-wider border transition-colors ${
                wearN95
                  ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                  : 'border-[#12612F] bg-[#020A05] text-[#2FBF63] hover:border-[#4CFF8A]'
              }`}
              style={{ borderRadius: 0 }}
            >
              {wearN95 ? '[ACTIVE]' : '[OFF]'}
            </button>
          </div>

          {/* Slider 3: Controller Adherence */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="target-adherence-slider" className="text-xs text-[#B6FFCC] uppercase font-medium">
                CONTROLLER ICS ADHERENCE ENFORCEMENT
              </label>
              <span className="font-mono text-sm text-[#4CFF8A] font-bold">
                {targetAdherence}% <span className="text-[10px] text-[#2FBF63]">(BASELINE: {patient.controllerAdherence}%)</span>
              </span>
            </div>
            <input
              id="target-adherence-slider"
              type="range"
              min={patient.controllerAdherence}
              max="100"
              step="2"
              value={targetAdherence}
              onChange={(e) => {
                setTargetAdherence(parseInt(e.target.value));
                handleSimulate();
              }}
              className="w-full accent-[#4CFF8A] bg-[#061C0E] h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#2FBF63] font-mono">
              <span>{patient.controllerAdherence}% (CURRENT)</span>
              <span>85% (REGULAR DOSES)</span>
              <span>100% (STRICT COMPLIANCE)</span>
            </div>
          </div>

          {/* Toggle 4: HEPA Air Purifier at Home */}
          <div className="border border-[#12612F] bg-[#061C0E] p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[#B6FFCC] uppercase">
                HOME INDOOR HEPA AIR PURIFIER (BEDROOM)
              </div>
              <p className="text-[11px] text-[#2FBF63] mt-0.5">
                Suppresses indoor PM2.5 infiltration during nocturnal sleep period (70% cleaner indoor air).
              </p>
            </div>
            <button
              onClick={() => {
                setHepaPurifier(prev => !prev);
                handleSimulate();
              }}
              className={`h-9 px-4 text-xs font-mono font-semibold uppercase tracking-wider border transition-colors ${
                hepaPurifier
                  ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                  : 'border-[#12612F] bg-[#020A05] text-[#2FBF63] hover:border-[#4CFF8A]'
              }`}
              style={{ borderRadius: 0 }}
            >
              {hepaPurifier ? '[ACTIVE]' : '[OFF]'}
            </button>
          </div>

          {/* Simulation Re-run trigger button */}
          <div className="pt-2">
            <button
              onClick={handleSimulate}
              disabled={isSimulating}
              className="w-full h-11 text-xs uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors flex items-center justify-center font-mono"
            >
              {isSimulating ? '&gt; RECALCULATING TWIN TRAJECTORY...' : '&gt; RE-RUN PHYSIOLOGICAL FORECAST'}
            </button>
          </div>
        </div>

        {/* Right: Side-by-Side Comparison Output */}
        <div className="lg:col-span-5 space-y-5">
          {/* Comparison Cards */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-4">
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63] border-b border-[#12612F]/40 pb-2">{`// FORECAST TRAJECTORY COMPARISON`}</div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Baseline Trajectory */}
              <div className="border border-[#12612F] bg-[#020A05] p-3 space-y-2">
                <div className="text-[10px] text-[#2FBF63] uppercase font-mono">CURRENT TRAJECTORY</div>
                <div className="text-3xl font-bold font-mono text-[#FF2A1A] tabular-nums glow-danger">
                  {baseRisk}%
                </div>
                <StatusChip status={patient.riskLevel} size="sm" />
                <div className="text-[10px] text-[#2FBF63] pt-1">
                  I(t) = {patient.estimatedInflammationState.toFixed(2)}
                </div>
              </div>

              {/* Counterfactual Trajectory */}
              <div className="border border-[#4CFF8A] bg-[#061C0E] p-3 space-y-2">
                <div className="text-[10px] text-[#4CFF8A] uppercase font-mono">SIMULATED TRAJECTORY</div>
                <div className={`text-3xl font-bold font-mono tabular-nums ${
                  simulatedRisk < 40 ? 'text-[#4CFF8A] glow-text' :
                  simulatedRisk < 60 ? 'text-[#FFE14A]' : 'text-[#FFA61F]'
                }`}>
                  {simulatedRisk}%
                </div>
                <StatusChip status={simulatedStatus} size="sm" />
                <div className="text-[10px] text-[#2FBF63] pt-1">
                  I(t) = {simulatedInflammation.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Delta Callout */}
            <div className="border border-[#4CFF8A]/60 bg-[#020A05] p-3 flex items-center justify-between">
              <span className="text-xs uppercase text-[#2FBF63]">TOTAL RISK REDUCTION:</span>
              <span className="text-base font-mono font-bold text-[#4CFF8A] glow-text">
                {riskDelta === 0 ? '0%' : `${riskDelta}% DELTA`}
              </span>
            </div>

            {/* Generated Clinical Recommendation */}
            <div className="space-y-1.5 pt-2 border-t border-[#12612F]/40 text-xs">
              <div className="text-[#B6FFCC] font-semibold uppercase">
                &gt; RECOMMENDED DOCTOR ACTION:
              </div>
              <p className="text-[11px] text-[#4CFF8A] leading-relaxed">
                {simulatedRisk < 40 
                  ? `Advise ${patient.name} to wear N95 during commute, minimize outdoor time to ${outdoorHours}h, and ensure 100% adherence to ${patient.controllerMedication}. This reduces 48h flare-up risk below clinical trigger threshold.`
                  : `Even with partial intervention, projected risk remains elevated (${simulatedRisk}%). Consider temporary step-up of inhaled steroid dosage until regional PM2.5 inversion clears.`}
              </p>
            </div>
          </div>

          {/* Quick link to Mobile Mockup */}
          <div className="border border-[#12612F] bg-[#061C0E] p-4 text-xs space-y-2">
            <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider">
              PRD SECTION 4 COMPLIANCE
            </div>
            <div className="text-xs font-semibold text-[#B6FFCC]">
              Preview Patient Mobile Smartphone Alert
            </div>
            <p className="text-[11px] text-[#2FBF63]">
              View how this plain-language warning and recommended action will appear on the patient’s phone screen.
            </p>
            <div className="pt-1">
              <Link
                href="/patient-preview"
                className="text-xs uppercase font-semibold text-[#4CFF8A] hover:underline flex items-center"
              >
                OPEN MOBILE ALERT MOCKUP &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
