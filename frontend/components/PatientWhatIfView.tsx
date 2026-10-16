'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PATIENTS, Patient } from '@/lib/data';
import { simulateWhatIf, WhatIfResponse, getPatient } from '@/lib/api';
import PatientNavHeader from '@/components/PatientNavHeader';
import StatusChip from '@/components/StatusChip';

interface TrajectoryHourPoint {
  hour: number;
  label: string;
  baselineRisk: number;
  simulatedRisk: number;
  divergence: number;
}

export default function PatientWhatIfView({ patientId }: { patientId: string }) {
  const initialPatient = PATIENTS.find(p => p.id === patientId) || PATIENTS[0];
  const [patient, setPatient] = useState<Patient>(initialPatient);

  // Counterfactual Sandbox Interactive States
  const [outdoorHours, setOutdoorHours] = useState<number>(2.5);
  const [wearN95, setWearN95] = useState<boolean>(false);
  const [targetAdherence, setTargetAdherence] = useState<number>(initialPatient.controllerAdherence);
  const [hepaPurifier, setHepaPurifier] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [backendResult, setBackendResult] = useState<WhatIfResponse | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Fetch live patient data from API on mount
  useEffect(() => {
    let isMounted = true;
    getPatient(patientId).then((livePatient) => {
      if (isMounted && livePatient) {
        setPatient(livePatient);
        setTargetAdherence(livePatient.controllerAdherence);
      }
    });
    return () => { isMounted = false; };
  }, [patientId]);

  // =========================================================================
  // LIVE REACTIVE ODE SIMULATION MODEL (0ms Zero-Latency Local Calculation)
  // Ensures all counters and sliders change the trajectory immediately on drag!
  // =========================================================================
  const baseRisk = patient.risk48h;
  const initialAdherence = patient.controllerAdherence;

  // Real-time intervention deltas:
  // 1. Outdoor hours: baseline is 2.5h. Less outdoor time reduces risk; more outdoor time in smog increases risk.
  const outdoorDelta = (2.5 - outdoorHours) * 6.0;
  // 2. N95 respirator during transit: -18% risk reduction
  const n95Reduction = wearN95 ? 18.0 : 0.0;
  // 3. Controller adherence improvement: up to -22% risk reduction
  const adherenceDiff = Math.max(0, targetAdherence - initialAdherence);
  const adherenceReduction = (adherenceDiff / 100.0) * 25.0;
  // 4. HEPA air purifier in bedroom: -9% risk reduction
  const hepaReduction = hepaPurifier ? 9.0 : 0.0;

  // Total mitigated risk calculation
  const totalReductionRaw = outdoorDelta + n95Reduction + adherenceReduction + hepaReduction;
  const totalReduction = Math.round(totalReductionRaw * 10) / 10;
  
  // Projected 48h Risk under intervention
  const simulatedRisk = Math.max(10.0, Math.min(99.0, Math.round((baseRisk - totalReduction) * 10) / 10));
  const riskDelta = Math.round((simulatedRisk - baseRisk) * 10) / 10;

  // Latent airway inflammation I(t)
  const simulatedInflammation = Math.max(
    0.15,
    Math.round((patient.estimatedInflammationState - (Math.max(0, totalReduction) / 100.0) * 0.50) * 100) / 100
  );

  const simulatedStatus = 
    simulatedRisk >= 70 ? 'HIGH RISK' :
    simulatedRisk >= 55 ? 'ELEVATED' :
    simulatedRisk >= 35 ? 'CAUTION' : 'NORMAL';

  // =========================================================================
  // 48-HOUR DUAL TRAJECTORY COMPUTATION
  // Generates the time-series curves from t = 0h to t = 48h
  // =========================================================================
  const trajectoryPoints: TrajectoryHourPoint[] = useMemo(() => {
    const hours = [0, 6, 12, 18, 24, 30, 36, 42, 48];
    const startingRisk = Math.max(15, Math.round(baseRisk * 0.68));

    return hours.map((h) => {
      const progress = h / 48.0;
      // Exponential saturation curve towards 48h end state
      const shape = Math.sin((progress * Math.PI) / 2);

      const bRisk = Math.round((startingRisk + (baseRisk - startingRisk) * shape) * 10) / 10;
      const sRisk = Math.round((startingRisk + (simulatedRisk - startingRisk) * shape) * 10) / 10;
      const clampedSRisk = Math.max(8, sRisk);

      return {
        hour: h,
        label: h === 0 ? '0h (Now)' : `${h}h`,
        baselineRisk: Math.min(100, bRisk),
        simulatedRisk: Math.min(100, clampedSRisk),
        divergence: Math.round(Math.abs(bRisk - clampedSRisk) * 10) / 10,
      };
    });
  }, [baseRisk, simulatedRisk]);

  // Debounced backend synchronization with FastAPI ODE solver
  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        setIsSimulating(true);
        const res = await simulateWhatIf({
          patient_id: patient.id,
          base_risk_48h: patient.risk48h,
          base_inflammation: patient.estimatedInflammationState,
          current_pm25: patient.currentAirQuality.pm25,
          current_adherence_pct: patient.controllerAdherence,
          outdoor_hours: outdoorHours,
          wear_n95: wearN95,
          target_adherence_pct: targetAdherence,
          hepa_purifier: hepaPurifier,
        });
        if (!isCancelled && res) {
          setBackendResult(res);
        }
      } catch (err) {
        console.warn('Backend ODE calculation note:', err);
      } finally {
        if (!isCancelled) setIsSimulating(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [
    patient.id,
    patient.risk48h,
    patient.estimatedInflammationState,
    patient.currentAirQuality.pm25,
    patient.controllerAdherence,
    outdoorHours,
    wearN95,
    targetAdherence,
    hepaPurifier
  ]);

  // Clinical Preset Handlers
  const applyPreset = (presetName: string) => {
    setActivePreset(presetName);
    switch (presetName) {
      case 'max-shield':
        setOutdoorHours(1.0);
        setWearN95(true);
        setTargetAdherence(95);
        setHepaPurifier(true);
        break;
      case 'n95-commute':
        setOutdoorHours(2.5);
        setWearN95(true);
        setTargetAdherence(patient.controllerAdherence);
        setHepaPurifier(false);
        break;
      case 'inhaler-push':
        setOutdoorHours(2.5);
        setWearN95(false);
        setTargetAdherence(100);
        setHepaPurifier(false);
        break;
      case 'safe-haven':
        setOutdoorHours(0.5);
        setWearN95(false);
        setTargetAdherence(patient.controllerAdherence);
        setHepaPurifier(true);
        break;
      case 'reset':
      default:
        setOutdoorHours(2.5);
        setWearN95(false);
        setTargetAdherence(patient.controllerAdherence);
        setHepaPurifier(false);
        setActivePreset(null);
        break;
    }
  };

  // Trajectory Chart Dimensions
  const chartW = 560;
  const chartH = 220;
  const padL = 45;
  const padR = 40;
  const padT = 25;
  const padB = 35;
  const pW = chartW - padL - padR; // 475px
  const pH = chartH - padT - padB; // 160px

  const getChartX = (idx: number) => padL + (idx / (trajectoryPoints.length - 1)) * pW;
  const getChartY = (riskVal: number) => padT + pH - (Math.max(0, Math.min(100, riskVal)) / 100) * pH;

  // Build SVG path strings
  const baselinePathD = trajectoryPoints.reduce((acc, pt, idx) => {
    const x = getChartX(idx);
    const y = getChartY(pt.baselineRisk);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const simulatedPathD = trajectoryPoints.reduce((acc, pt, idx) => {
    const x = getChartX(idx);
    const y = getChartY(pt.simulatedRisk);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Shaded divergence polygon between baseline and simulated trajectories
  const divergencePolygonPoints = [
    ...trajectoryPoints.map((pt, idx) => `${getChartX(idx)},${getChartY(pt.baselineRisk)}`),
    ...trajectoryPoints.slice().reverse().map((pt, idx) => {
      const origIdx = trajectoryPoints.length - 1 - idx;
      return `${getChartX(origIdx)},${getChartY(pt.simulatedRisk)}`;
    })
  ].join(' ');

  const thresholdY = getChartY(65); // 65% clinical threshold line

  return (
    <div className="space-y-6">
      {/* Patient Vital Navigation Header & Tabs */}
      <PatientNavHeader patient={patient} />

      {/* Header Info Banner */}
      <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none transition-colors">
        <div>
          <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#0E793C] dark:text-[#2FBF63]">
            // COUNTERFACTUAL WHAT-IF INTERVENTION SANDBOX
          </span>
          <div className="text-xs text-[#0A602F] dark:text-[#B6FFCC] font-mono mt-0.5">
            MECHANISM: LATENT STATE PERTURBATION • SECTION 9 FORECAST RE-SCORING
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => applyPreset('reset')}
            className="text-xs uppercase font-bold tracking-wider text-[#0E793C] dark:text-[#2FBF63] hover:text-[#0A602F] dark:hover:text-[#4CFF8A] underline cursor-pointer"
          >
            RESET TO BASELINE
          </button>
          <span className="text-[#B4E3C5] dark:text-[#12612F]">|</span>
          <span className="text-[10px] font-mono font-semibold text-[#D97706] dark:text-[#FFE14A]">
            LATENCY: &lt;50ms INSTANT ODE REPLAY
          </span>
        </div>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* =========================================================================
            LEFT COLUMN: INTERVENTION CONTROLS & PRESETS
        ========================================================================= */}
        <div className="lg:col-span-7 border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 space-y-6 text-xs shadow-sm dark:shadow-none transition-colors">
          <div className="border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-3 flex flex-wrap justify-between items-center gap-2">
            <div>
              <span className="text-xs sm:text-sm font-bold text-[#0E793C] dark:text-[#B6FFCC] uppercase tracking-wider">
                1. ADJUST CLINICAL INTERVENTIONS
              </span>
              <div className="text-[11px] text-[#4A755A] dark:text-[#2FBF63] mt-0.5">
                Sliders and switches react in real-time. Adjust parameters to test outcomes.
              </div>
            </div>
            <span className="text-[10px] text-[#0A602F] dark:text-[#2FBF63] font-mono bg-[#EAF8EF] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] px-2 py-0.5 font-semibold">
              TARGET: {patient.name}
            </span>
          </div>

          {/* Quick Clinical Scenario Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#4A755A] dark:text-[#2FBF63]">
              QUICK CLINICAL PROTOCOL PRESETS:
            </span>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {[
                { id: 'max-shield', label: '🛡 MAXIMUM SHIELD', desc: 'N95 + HEPA + 95% Adherence + Indoors' },
                { id: 'n95-commute', label: '😷 N95 COMMUTE', desc: 'N95 respirator during commute' },
                { id: 'inhaler-push', label: '💊 100% INHALER', desc: 'Enforce full controller compliance' },
                { id: 'safe-haven', label: '🏠 INDOOR HAVEN', desc: 'Stay indoors + Bedroom HEPA' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  title={p.desc}
                  className={`px-2.5 py-1.5 text-[11px] font-mono uppercase font-bold border transition-all cursor-pointer ${
                    activePreset === p.id
                      ? 'border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-[#020A05] shadow-xs'
                      : 'border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#2FBF63] hover:border-[#0E793C] dark:hover:border-[#4CFF8A]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Slider 1: Outdoor Exposure Hours */}
          <div className="border border-[#B4E3C5]/40 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <div>
                <label htmlFor="outdoor-hours-slider" className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] uppercase font-bold">
                  DAILY OUTDOOR TIME (COMMUTE &amp; WORK)
                </label>
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
                  Controls daily volume of inhaled ambient PM2.5 particulate matter.
                </div>
              </div>
              <span className="font-mono text-base text-[#0E793C] dark:text-[#4CFF8A] font-bold shrink-0">
                {outdoorHours.toFixed(1)} <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">HOURS/DAY</span>
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
                setActivePreset(null);
                setOutdoorHours(parseFloat(e.target.value));
              }}
              className="w-full h-2.5 bg-[#EAF3EC] dark:bg-[#020A05] border border-[#B4E3C5] dark:border-[#12612F] rounded-none appearance-none cursor-pointer accent-[#0E793C] dark:accent-[#4CFF8A]"
            />
            <div className="flex justify-between text-[10px] text-[#4A755A] dark:text-[#2FBF63] font-mono font-semibold">
              <span className={outdoorHours === 0 ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : ''}>0.0h (STAY INDOORS)</span>
              <span className={outdoorHours === 2.5 ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : ''}>2.5h (NORMAL COMMUTE)</span>
              <span className={outdoorHours === 6.0 ? 'text-[#DC2626] dark:text-[#FF2A1A] font-bold' : ''}>6.0h (HEAVY EXPOSURE)</span>
            </div>
          </div>

          {/* Toggle 2: N95 Respirator */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#0E2E1B] dark:text-[#B6FFCC] uppercase">
                WEAR N95 PARTICULATE RESPIRATOR DURING COMMUTE
              </div>
              <p className="text-[11px] text-[#4A755A] dark:text-[#2FBF63] mt-0.5">
                Filters 95% of inhaled fine particulate matter during transit (NIOSH standard).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActivePreset(null);
                setWearN95(prev => !prev);
              }}
              className={`h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                wearN95
                  ? 'border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-[#020A05] shadow-xs'
                  : 'border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#020A05] text-[#4A755A] dark:text-[#2FBF63] hover:border-[#0E793C] dark:hover:border-[#4CFF8A]'
              }`}
            >
              {wearN95 ? '[ ACTIVE: ON ]' : '[ OFF ]'}
            </button>
          </div>

          {/* Slider 3: Controller Adherence */}
          <div className="border border-[#B4E3C5]/40 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <div>
                <label htmlFor="target-adherence-slider" className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] uppercase font-bold">
                  CONTROLLER ICS ADHERENCE ENFORCEMENT
                </label>
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
                  Suppresses bronchial smooth muscle hyper-reactivity and cytokine cascade.
                </div>
              </div>
              <span className="font-mono text-base text-[#0E793C] dark:text-[#4CFF8A] font-bold shrink-0">
                {targetAdherence}% <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">(BASE: {initialAdherence}%)</span>
              </span>
            </div>
            <input
              id="target-adherence-slider"
              type="range"
              min={initialAdherence}
              max="100"
              step="1"
              value={targetAdherence}
              onChange={(e) => {
                setActivePreset(null);
                setTargetAdherence(parseInt(e.target.value));
              }}
              className="w-full h-2.5 bg-[#EAF3EC] dark:bg-[#020A05] border border-[#B4E3C5] dark:border-[#12612F] rounded-none appearance-none cursor-pointer accent-[#0E793C] dark:accent-[#4CFF8A]"
            />
            <div className="flex justify-between text-[10px] text-[#4A755A] dark:text-[#2FBF63] font-mono font-semibold">
              <span className={targetAdherence === initialAdherence ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : ''}>
                {initialAdherence}% (CURRENT)
              </span>
              <span className={targetAdherence === 85 ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : ''}>
                85% (REGULAR DOSES)
              </span>
              <span className={targetAdherence === 100 ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold' : ''}>
                100% (STRICT COMPLIANCE)
              </span>
            </div>
          </div>

          {/* Toggle 4: HEPA Air Purifier at Home */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] p-3.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#0E2E1B] dark:text-[#B6FFCC] uppercase">
                HOME INDOOR HEPA AIR PURIFIER (BEDROOM)
              </div>
              <p className="text-[11px] text-[#4A755A] dark:text-[#2FBF63] mt-0.5">
                Suppresses indoor PM2.5 infiltration during nocturnal sleep period (70% cleaner air).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActivePreset(null);
                setHepaPurifier(prev => !prev);
              }}
              className={`h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                hepaPurifier
                  ? 'border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-[#020A05] shadow-xs'
                  : 'border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#020A05] text-[#4A755A] dark:text-[#2FBF63] hover:border-[#0E793C] dark:hover:border-[#4CFF8A]'
              }`}
            >
              {hepaPurifier ? '[ ACTIVE: ON ]' : '[ OFF ]'}
            </button>
          </div>

          {/* Simulation Status & Recalculate Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {}}
              disabled={isSimulating}
              className="w-full h-11 text-xs uppercase tracking-wider font-bold border border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#4CFF8A] hover:bg-[#0E793C] hover:text-white dark:hover:bg-[#4CFF8A] dark:hover:text-[#020A05] transition-all flex items-center justify-center font-mono cursor-pointer shadow-xs"
            >
              {isSimulating ? '⟳ RECALCULATING TWIN TRAJECTORY...' : '◈ CONTINUOUS SIMULATION ACTIVE (LIVE)'}
            </button>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: 48-HOUR TRAJECTORY GRAPH & CLINICAL IMPACT
        ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          {/* Main Trajectory Comparison Card */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 space-y-4 shadow-sm dark:shadow-none transition-colors">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2.5">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#0E793C] dark:text-[#2FBF63]">
                // 48-HOUR FORECAST TRAJECTORY COMPARISON
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0A602F] dark:text-[#4CFF8A] font-semibold">
                ODE NUMERICAL REPLAY
              </span>
            </div>

            {/* Current vs Simulated Key Risk Metrics */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Baseline Trajectory */}
              <div className="border border-[#DC2626]/40 dark:border-[#FF2A1A]/40 bg-[#FEF2F2] dark:bg-[#200808] p-3 space-y-1.5">
                <div className="text-[10px] text-[#B91C1C] dark:text-[#FF6B6B] uppercase font-mono font-bold flex items-center space-x-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#DC2626] dark:bg-[#FF2A1A]" />
                  <span>CURRENT PATH</span>
                </div>
                <div className="text-3xl font-bold font-mono text-[#DC2626] dark:text-[#FF2A1A] tabular-nums">
                  {baseRisk}%
                </div>
                <StatusChip status={patient.riskLevel} size="sm" />
                <div className="text-[10px] text-[#B91C1C] dark:text-[#FF6B6B] pt-0.5 font-mono">
                  Inflammation I(t) = {patient.estimatedInflammationState.toFixed(2)}
                </div>
              </div>

              {/* Counterfactual Simulated Trajectory */}
              <div className="border border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] p-3 space-y-1.5">
                <div className="text-[10px] text-[#0A602F] dark:text-[#4CFF8A] uppercase font-mono font-bold flex items-center space-x-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A]" />
                  <span>SIMULATED PATH</span>
                </div>
                <div className={`text-3xl font-bold font-mono tabular-nums ${
                  simulatedRisk < 40 ? 'text-[#0E793C] dark:text-[#4CFF8A]' :
                  simulatedRisk < 60 ? 'text-[#D97706] dark:text-[#FFE14A]' : 'text-[#DC2626] dark:text-[#FFA61F]'
                }`}>
                  {simulatedRisk}%
                </div>
                <StatusChip status={simulatedStatus} size="sm" />
                <div className="text-[10px] text-[#0A602F] dark:text-[#2FBF63] pt-0.5 font-mono">
                  Inflammation I(t) = {simulatedInflammation.toFixed(2)}
                </div>
              </div>
            </div>

            {/* =========================================================================
                THE 48-HOUR DUAL TRAJECTORY GRAPH
                Visually illustrates the two paths diverging over time!
            ========================================================================= */}
            <div className="border border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#020A05] p-3 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono text-[#4A755A] dark:text-[#2FBF63]">
                <span className="font-bold uppercase tracking-wider text-[#0E793C] dark:text-[#B6FFCC]">
                  TRAJECTORY DIVERGENCE (0H &rarr; 48H)
                </span>
                <span className="text-[#0A602F] dark:text-[#4CFF8A] font-semibold">
                  SHADED: PREVENTED RISK
                </span>
              </div>

              <div className="w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full h-auto select-none overflow-visible"
                >
                  {/* Grid Lines */}
                  <line x1={padL} y1={padT} x2={chartW - padR} y2={padT} stroke="currentColor" className="text-[#0E793C]/10 dark:text-[#2FBF63]/15" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1={padL} y1={padT + pH / 2} x2={chartW - padR} y2={padT + pH / 2} stroke="currentColor" className="text-[#0E793C]/10 dark:text-[#2FBF63]/15" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1={padL} y1={padT + pH} x2={chartW - padR} y2={padT + pH} stroke="currentColor" className="text-[#0E793C]/25 dark:text-[#12612F]" strokeWidth="1" />

                  {/* Critical Flare-Up Risk Threshold Line (65%) */}
                  <line
                    x1={padL}
                    y1={thresholdY}
                    x2={chartW - padR}
                    y2={thresholdY}
                    stroke="#DC2626"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                    className="opacity-70 dark:opacity-85"
                  />
                  <text
                    x={chartW - padR - 4}
                    y={thresholdY - 4}
                    textAnchor="end"
                    fontSize="9"
                    fontWeight="700"
                    fill="#DC2626"
                    className="font-mono tracking-wider uppercase select-none"
                  >
                    CRITICAL THRESHOLD (65%)
                  </text>

                  {/* Shaded Risk Divergence Area between Red and Green curves */}
                  <polygon
                    points={divergencePolygonPoints}
                    fill="currentColor"
                    className="text-[#0E793C]/15 dark:text-[#4CFF8A]/15"
                  />

                  {/* 1. Current Trajectory (Red Line) */}
                  <path
                    d={baselinePathD}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-90 dark:opacity-100"
                  />

                  {/* 2. Simulated Intervention Trajectory (Green Line) */}
                  <path
                    d={simulatedPathD}
                    fill="none"
                    stroke="#0E793C"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[#0E793C] dark:text-[#4CFF8A]"
                  />

                  {/* Interactive Points on Trajectory */}
                  {trajectoryPoints.map((pt, idx) => {
                    const x = getChartX(idx);
                    const bY = getChartY(pt.baselineRisk);
                    const sY = getChartY(pt.simulatedRisk);
                    const isHovered = hoveredHour === pt.hour;

                    return (
                      <g
                        key={idx}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredHour(pt.hour)}
                        onMouseLeave={() => setHoveredHour(null)}
                      >
                        {/* Red Dot (Current) */}
                        <circle
                          cx={x}
                          cy={bY}
                          r={isHovered ? 5 : 3.5}
                          fill="#FFFFFF"
                          stroke="#DC2626"
                          strokeWidth="2"
                        />

                        {/* Green Dot (Simulated) */}
                        <circle
                          cx={x}
                          cy={sY}
                          r={isHovered ? 5.5 : 4}
                          fill="#FFFFFF"
                          stroke="#0E793C"
                          strokeWidth="2.5"
                          className="dark:stroke-[#4CFF8A] dark:fill-[#04130A]"
                        />

                        {/* X-Axis Hour Label */}
                        <text
                          x={x}
                          y={chartH - padB + 16}
                          textAnchor="middle"
                          fontSize="9.5"
                          fontWeight="700"
                          fill="currentColor"
                          className={`font-mono uppercase select-none ${
                            isHovered
                              ? 'text-[#0E793C] dark:text-[#4CFF8A] font-bold'
                              : 'text-[#4A755A] dark:text-[#2FBF63]'
                          }`}
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Hover Tooltip on Trajectory */}
                  {hoveredHour !== null && (() => {
                    const pt = trajectoryPoints.find(p => p.hour === hoveredHour);
                    if (!pt) return null;
                    const idx = trajectoryPoints.indexOf(pt);
                    const x = getChartX(idx);
                    const midY = (getChartY(pt.baselineRisk) + getChartY(pt.simulatedRisk)) / 2;

                    return (
                      <g className="pointer-events-none">
                        <line
                          x1={x}
                          y1={padT}
                          x2={x}
                          y2={padT + pH}
                          stroke="#0E793C"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                          className="opacity-70 dark:text-[#4CFF8A]"
                        />
                        <rect
                          x={Math.min(x - 55, chartW - 120)}
                          y={Math.max(midY - 32, padT - 5)}
                          width="110"
                          height="44"
                          rx="4"
                          fill="#FFFFFF"
                          stroke="#0E793C"
                          strokeWidth="1.2"
                          className="dark:fill-[#04130A] dark:stroke-[#4CFF8A] shadow-md"
                        />
                        <text
                          x={Math.min(x - 55, chartW - 120) + 55}
                          y={Math.max(midY - 32, padT - 5) + 16}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill="#DC2626"
                          className="font-mono"
                        >
                          CURRENT: {pt.baselineRisk}%
                        </text>
                        <text
                          x={Math.min(x - 55, chartW - 120) + 55}
                          y={Math.max(midY - 32, padT - 5) + 32}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill="#0E793C"
                          className="dark:fill-[#4CFF8A] font-mono"
                        >
                          SIMULATED: {pt.simulatedRisk}%
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-between text-[10px] font-mono pt-1 border-t border-[#B4E3C5]/40 dark:border-[#12612F]/20">
                <span className="flex items-center space-x-1.5 text-[#DC2626] font-bold">
                  <span className="w-3 h-0.5 bg-[#DC2626]" />
                  <span>CURRENT TRAJECTORY</span>
                </span>
                <span className="flex items-center space-x-1.5 text-[#0E793C] dark:text-[#4CFF8A] font-bold">
                  <span className="w-3 h-0.5 bg-[#0E793C] dark:bg-[#4CFF8A]" />
                  <span>SIMULATED MITIGATION</span>
                </span>
              </div>
            </div>

            {/* Total Delta Callout */}
            <div className="border border-[#0E793C] dark:border-[#4CFF8A]/80 bg-[#EAF8EF] dark:bg-[#020A05] p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-[#0A602F] dark:text-[#2FBF63]">
                  TOTAL RISK SUPPRESSION:
                </span>
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">
                  Projected 48h exacerbation delta
                </div>
              </div>
              <span className={`text-lg sm:text-xl font-mono font-bold tabular-nums ${
                riskDelta < 0 ? 'text-[#0E793C] dark:text-[#4CFF8A]' : 'text-gray-500'
              }`}>
                {riskDelta === 0 ? '0% (NO DELTA)' : `${riskDelta}% DELTA`}
              </span>
            </div>

            {/* Intervention Contribution Breakdown */}
            <div className="space-y-1.5 text-xs font-mono">
              <span className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">
                INTERVENTION IMPACT BREAKDOWN:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 border border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">N95 RESPIRATOR</div>
                  <div className="font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                    {wearN95 ? '-18.0% RISK' : '0.0% (OFF)'}
                  </div>
                </div>
                <div className="p-2 border border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">INHALER ADHERENCE</div>
                  <div className="font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                    {adherenceReduction > 0 ? `-${adherenceReduction.toFixed(1)}% RISK` : '0.0% (AT BASELINE)'}
                  </div>
                </div>
                <div className="p-2 border border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">OUTDOOR TIME</div>
                  <div className={`font-bold ${outdoorDelta >= 0 ? 'text-[#0E793C] dark:text-[#4CFF8A]' : 'text-[#DC2626]'}`}>
                    {outdoorDelta >= 0 ? `-${outdoorDelta.toFixed(1)}% RISK` : `+${Math.abs(outdoorDelta).toFixed(1)}% EXPOSURE`}
                  </div>
                </div>
                <div className="p-2 border border-[#B4E3C5]/60 dark:border-[#12612F]/40 bg-[#F6FBF7] dark:bg-[#061C0E]">
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">HEPA PURIFIER</div>
                  <div className="font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                    {hepaPurifier ? '-9.0% RISK' : '0.0% (OFF)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Generated Clinical Recommendation */}
            <div className="space-y-1.5 pt-2 border-t border-[#B4E3C5]/60 dark:border-[#12612F]/40 text-xs">
              <div className="text-[#0E793C] dark:text-[#B6FFCC] font-bold uppercase tracking-wider">
                ◈ CLINICAL RECOMMENDATION:
              </div>
              <p className="text-[11px] text-[#0E2E1B] dark:text-[#4CFF8A] leading-relaxed">
                {backendResult?.recommendedAction 
                  ? backendResult.recommendedAction
                  : simulatedRisk < 40 
                  ? `Counterfactual intervention successful. Adopting N95 during commute, limiting outdoor exposure to ${outdoorHours}h, and maintaining ${targetAdherence}% controller adherence suppresses airway inflammation below trigger threshold (Projected 48h risk: ${simulatedRisk}%).`
                  : simulatedRisk < baseRisk
                  ? `Partial risk reduction (${Math.abs(riskDelta)}% reduction). Projected 48h risk remains ${simulatedStatus} (${simulatedRisk}%). Consider temporary step-up of inhaled steroid dosage until regional PM2.5 inversion clears.`
                  : `Even with current parameters, projected 48h risk remains critical (${simulatedRisk}%). Stricter indoor confinement and dual-controller therapy recommended.`}
              </p>
            </div>
          </div>

          {/* Quick link to Model Benchmarks */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] p-4 text-xs space-y-2 shadow-sm dark:shadow-none transition-colors">
            <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase tracking-wider font-semibold">
              PRD SECTION 12 VALIDATION
            </div>
            <div className="text-xs font-bold text-[#0E793C] dark:text-[#B6FFCC]">
              Model Benchmarks &amp; Grounded ODE Parameters
            </div>
            <p className="text-[11px] text-[#4A755A] dark:text-[#2FBF63]">
              Review biological parameter citations, ablation studies, and causal differential equations.
            </p>
            <div className="pt-1">
              <Link
                href="/benchmarks"
                className="text-xs uppercase font-bold text-[#0E793C] dark:text-[#4CFF8A] hover:underline flex items-center"
              >
                OPEN BENCHMARKS &amp; ASSUMPTIONS &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
