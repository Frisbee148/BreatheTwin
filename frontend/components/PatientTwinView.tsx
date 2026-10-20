'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PATIENTS, PATIENT_TELEMETRY_SERIES, Patient, TelemetryPoint } from '@/lib/data';
import { getPatient, getPatientTelemetry, getStoredCustomPatients } from '@/lib/api';
import PatientNavHeader from '@/components/PatientNavHeader';
import ThermalViewer from '@/components/ThermalViewer';
import TelemetryChart from '@/components/TelemetryChart';

export default function PatientTwinView({ patientId, initialPatient: propPatient }: { patientId: string; initialPatient?: Patient }) {
  const defaultPatient = propPatient || PATIENTS.find(p => p.id === patientId) || getStoredCustomPatients().find(p => p.id === patientId) || PATIENTS[0];
  const [patient, setPatient] = useState<Patient>(defaultPatient);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>(
    PATIENT_TELEMETRY_SERIES[patientId] || PATIENT_TELEMETRY_SERIES['PT-8821']
  );

  // Synchronized 7-Day Playback & Scrubbing Controller
  const [replayStep, setReplayStep] = useState<number>(
    telemetry.length > 0 ? telemetry.length - 1 : 0
  );
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);

  useEffect(() => {
    let isMounted = true;
    const fetchLive = async () => {
      try {
        const [livePatient, liveTelem] = await Promise.all([
          getPatient(patientId),
          getPatientTelemetry(patientId),
        ]);
        if (isMounted) {
          if (livePatient) setPatient(livePatient);
          if (liveTelem && liveTelem.length > 0) {
            setTelemetry(liveTelem);
            setReplayStep(liveTelem.length - 1);
          }
        }
      } catch (err) {
        console.warn('Using local cache for patient twin:', err);
      }
    };
    fetchLive();
    return () => { isMounted = false; };
  }, [patientId]);

  // Synchronized animation clock ticker
  useEffect(() => {
    if (!isReplaying || telemetry.length === 0) return;
    const intervalMs = 1200 / replaySpeed;
    const interval = setInterval(() => {
      setReplayStep((prev) => {
        if (prev >= telemetry.length - 1) {
          setIsReplaying(false);
          return telemetry.length - 1;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isReplaying, replaySpeed, telemetry.length]);

  const handleTogglePlay = () => {
    if (isReplaying) {
      setIsReplaying(false);
    } else {
      if (replayStep >= telemetry.length - 1) {
        setReplayStep(0);
      }
      setIsReplaying(true);
    }
  };

  const handleRestart = () => {
    setReplayStep(0);
    setIsReplaying(true);
  };

  const handlePrevStep = () => {
    setIsReplaying(false);
    setReplayStep(prev => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    setIsReplaying(false);
    setReplayStep(prev => Math.min(telemetry.length - 1, prev + 1));
  };

  const handleScrub = (step: number) => {
    setIsReplaying(false);
    setReplayStep(step);
  };

  const activeTelemetryPoint = telemetry[replayStep] || telemetry[telemetry.length - 1];

  return (
    <div className="space-y-8">
      {/* Patient Vital Navigation Header & Tabs */}
      <PatientNavHeader patient={patient} />

      {/* Main Grid: Thermal Twin Viewport + Latent Mechanistic State */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Thermal Pulmonary Twin */}
        <div className="lg:col-span-8 min-w-0">
          <ThermalViewer
            patient={patient}
            patientName={patient.name}
            patientId={patient.id}
            overallStatus={patient.riskLevel}
            imageSrc="/images/lung-thermal.png"
          />
        </div>

        {/* Right Column: Latent Mechanistic State Gauge & Quick EHR */}
        <div className="lg:col-span-4 space-y-5 min-w-0">
          {/* Latent State I(t) Panel */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs space-y-4 shadow-sm dark:shadow-none transition-colors">
            <div className="flex items-center justify-between border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2">
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#0E793C] dark:text-[#2FBF63]">{`◈ LATENT AIRWAY STATE I(t)`}</span>
              <span className="text-[10px] font-mono text-[#0A602F] dark:text-[#B6FFCC] border border-[#0E793C]/40 dark:border-[#12612F] px-1.5 py-0.5 bg-[#EAF8EF] dark:bg-transparent">
                KALMAN ESTIMATED
              </span>
            </div>

            <div>
              <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase tracking-wider mb-1 font-semibold">
                CURRENT INFLAMMATION LOAD
              </div>
              <div className="flex items-baseline space-x-2">
                <span className={`text-3xl font-bold font-mono tabular-nums ${
                  patient.estimatedInflammationState >= patient.inflammationThreshold 
                    ? 'text-[#DC2626] dark:text-[#FF2A1A] glow-danger' 
                    : 'text-[#0E793C] dark:text-[#4CFF8A]'
                }`}>
                  {patient.estimatedInflammationState.toFixed(2)}
                </span>
                <span className="text-xs text-[#4A755A] dark:text-[#2FBF63]">/ 1.00 max</span>
              </div>
            </div>

            {/* Threshold Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-[#0E793C] dark:text-[#2FBF63]">
                <span>THRESHOLD: {patient.inflammationThreshold.toFixed(2)}</span>
                <span className={patient.estimatedInflammationState >= patient.inflammationThreshold ? 'text-[#DC2626] dark:text-[#FF2A1A] font-bold' : 'text-[#0E793C] dark:text-[#4CFF8A]'}>
                  {patient.estimatedInflammationState >= patient.inflammationThreshold ? '+29% EXCEEDED' : 'WITHIN BUFFER'}
                </span>
              </div>
              <div className="w-full h-3 bg-[#EAF3EC] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] relative overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    patient.estimatedInflammationState >= patient.inflammationThreshold 
                      ? 'bg-[#DC2626] dark:bg-[#FF2A1A]' 
                      : 'bg-[#0E793C] dark:bg-[#4CFF8A]'
                  }`}
                  style={{ width: `${patient.estimatedInflammationState * 100}%` }}
                />
                {/* Marker line for threshold */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#FFE14A] z-10"
                  style={{ left: `${patient.inflammationThreshold * 100}%` }}
                  title="Critical Flare-Up Threshold"
                />
              </div>
            </div>

            <p className="text-[11px] text-[#4A755A] dark:text-[#2FBF63] leading-relaxed pt-1">
              Derived from equation <span className="font-mono text-[#0E793C] dark:text-[#4CFF8A] font-bold">dI/dt</span> fusing inhaled PM2.5 dose, cold dry air triggers, minus controller ICS suppression.
            </p>
          </div>

          {/* Quick EHR & Air Quality Snapshot */}
          <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs space-y-3 shadow-sm dark:shadow-none transition-colors">
            <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#0E793C] dark:text-[#2FBF63] border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-2">{`◈ CURRENT AMBIENT & RESCUE METRICS`}</div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="border border-[#B4E3C5]/40 dark:border-[#12612F]/40 p-2.5 bg-[#F6FBF7] dark:bg-[#061C0E]">
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase font-semibold">AMBIENT PM2.5</div>
                <div className="text-base font-bold font-mono text-[#DC2626] dark:text-[#FF2A1A]">
                  {patient.currentAirQuality.pm25} <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">µg/m³</span>
                </div>
                <div className="text-[10px] text-[#0E793C] dark:text-[#2FBF63]">{patient.currentAirQuality.aqiCategory}</div>
              </div>

              <div className="border border-[#B4E3C5]/40 dark:border-[#12612F]/40 p-2.5 bg-[#F6FBF7] dark:bg-[#061C0E]">
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63] uppercase font-semibold">RESCUE PUFFS (24H)</div>
                <div className="text-base font-bold font-mono text-[#D97706] dark:text-[#FFE14A]">
                  {patient.currentTelemetry.rescuePuffs24h} <span className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">doses</span>
                </div>
                <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">Baseline: 0-1/day</div>
              </div>
            </div>

            <div className="border-t border-[#B4E3C5]/40 dark:border-[#12612F]/40 pt-3 flex justify-between items-center">
              <span className="text-[#4A755A] dark:text-[#2FBF63] font-semibold">NEXT WORKFLOW STEP:</span>
              <Link
                href={`/patients/${patient.id}/forecast`}
                className="text-xs uppercase font-bold text-[#0E793C] dark:text-[#4CFF8A] hover:underline"
              >
                48H FORECAST &amp; REASONS &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          7-DAY PHYSIOLOGICAL TIME-SERIES STREAMS & ANIMATION CONTROLLER
      ========================================================================= */}
      <div className="space-y-6 pt-4">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B4E3C5] dark:border-[#12612F] pb-3">
          <div>
            <h2 className="text-xl font-bold text-[#0E793C] dark:text-[#B6FFCC] tracking-wide">
              {`◈ Dynamic Sensor Telemetry (7-Day Replay)`}
            </h2>
            <div className="text-xs text-[#4A755A] dark:text-[#2FBF63] mt-0.5">
              Continuous vital streams with zero-collision reference margins. Play or scrub through the timeline to inspect signal trajectory.
            </div>
          </div>
          <span className="text-xs font-mono text-[#0E793C] dark:text-[#4CFF8A] border border-[#B4E3C5] dark:border-[#12612F] px-2.5 py-1 bg-[#EAF8EF] dark:bg-[#04130A] font-semibold">
            SAMPLING: HOURLY AGGREGATE
          </span>
        </div>

        {/* Global Synchronized Replay & Animation Controller Console */}
        <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-4 text-xs font-mono space-y-3.5 shadow-sm dark:shadow-none transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-3">
            <div className="flex items-center space-x-2.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A] animate-pulse" />
              <span className="font-bold text-[#0E2E1B] dark:text-[#B6FFCC] tracking-wider uppercase text-xs sm:text-sm">
                ◈ 7-DAY WEARABLE STREAM CONTROLLER
              </span>
              <span className="text-[10px] px-2 py-0.5 border border-[#B4E3C5] dark:border-[#12612F] text-[#0A602F] dark:text-[#2FBF63] bg-[#EAF8EF] dark:bg-[#061C0E] font-semibold">
                {isReplaying ? 'STREAMING ACTIVE' : 'SCRUB MODE'}
              </span>
            </div>

            {/* Transport Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="px-3.5 py-1.5 font-bold uppercase tracking-wider text-xs border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A]/15 text-white dark:text-[#4CFF8A] hover:bg-[#0A602F] dark:hover:bg-[#4CFF8A] dark:hover:text-[#020A05] transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <span>{isReplaying ? '❚❚ PAUSE' : '▶ PLAY REPLAY'}</span>
              </button>

              <button
                type="button"
                onClick={handleRestart}
                title="Restart replay from Day 1"
                className="px-3 py-1.5 text-xs font-bold border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#2FBF63] hover:text-[#0A602F] dark:hover:text-white hover:border-[#0E793C] dark:hover:border-[#4CFF8A] transition-all cursor-pointer"
              >
                ↺ RESTART
              </button>

              {/* Step Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={replayStep <= 0}
                  title="Previous Day"
                  className="px-2.5 py-1.5 text-xs border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#2FBF63] hover:text-[#0A602F] dark:hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={replayStep >= telemetry.length - 1}
                  title="Next Day"
                  className="px-2.5 py-1.5 text-xs border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#2FBF63] hover:text-[#0A602F] dark:hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  ▶
                </button>
              </div>

              {/* Speed Toggles */}
              <div className="flex items-center border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] text-[10px]">
                {[1, 2, 4].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReplaySpeed(s)}
                    className={`px-2.5 py-1 font-bold cursor-pointer transition-colors ${
                      replaySpeed === s 
                        ? 'bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-[#020A05]' 
                        : 'text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E793C] dark:hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrubber Slider & Timeline Markers */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-[#4A755A] dark:text-[#2FBF63]">
                ACTIVE OBSERVATION: <strong className="text-[#0E793C] dark:text-[#4CFF8A]">{activeTelemetryPoint?.day || `Point ${replayStep + 1}`}</strong> {activeTelemetryPoint?.date && `(${activeTelemetryPoint.date})`}
              </span>
              <span className="text-[#0A602F] dark:text-[#B6FFCC] font-bold">
                TIMELINE: {replayStep + 1} / {telemetry.length} DAYS ({Math.round(((replayStep + 1) / telemetry.length) * 100)}%)
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={telemetry.length - 1}
              value={replayStep}
              onChange={(e) => handleScrub(Number(e.target.value))}
              className="w-full h-2.5 bg-[#EAF3EC] dark:bg-[#061C0E] border border-[#B4E3C5] dark:border-[#12612F] rounded-none appearance-none cursor-pointer accent-[#0E793C] dark:accent-[#4CFF8A]"
            />

            {/* Day Tick Badges */}
            <div className="flex justify-between text-[11px] font-mono pt-1">
              {telemetry.map((pt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleScrub(idx)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    idx === replayStep 
                      ? 'bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-[#020A05] font-bold shadow-xs' 
                      : (idx < replayStep ? 'text-[#0E793C] dark:text-[#4CFF8A] font-semibold' : 'text-[#4A755A] dark:text-[#2FBF63]/70 hover:text-[#0E793C] dark:hover:text-white')
                  }`}
                >
                  {pt.dayShort || `D${idx + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stacked Full-Width Telemetry Graphs (One Below Another for Optimal Visibility) */}
        <div className="flex flex-col space-y-8 w-full">
          {/* Chart 1: Resting Respiratory Rate */}
          <div id="chart-rr" className="w-full min-w-0 scroll-mt-20">
            <TelemetryChart
              title="RESTING RESPIRATORY RATE"
              data={telemetry}
              dataKey="rr"
              baseline={patient.baselineRR}
              threshold={18.0}
              thresholdDirection="above"
              unit="breaths/min"
              color="#0E793C"
              activeStep={replayStep}
              isPlaying={isReplaying}
              onStepChange={setReplayStep}
            />
          </div>

          {/* Chart 2: Nocturnal SpO2 */}
          <div id="chart-spo2" className="w-full min-w-0 scroll-mt-20">
            <TelemetryChart
              title="NOCTURNAL SPO2 SATURATION"
              data={telemetry}
              dataKey="spo2"
              baseline={96.5}
              threshold={92.0}
              thresholdDirection="below"
              unit="%"
              color="#0E793C"
              minVal={88}
              maxVal={100}
              activeStep={replayStep}
              isPlaying={isReplaying}
              onStepChange={setReplayStep}
            />
          </div>

          {/* Chart 3: Resting Heart Rate & Autonomic Tone */}
          <div id="chart-rhr" className="w-full min-w-0 scroll-mt-20">
            <TelemetryChart
              title="RESTING HEART RATE (RHR)"
              data={telemetry}
              dataKey="rhr"
              baseline={patient.baselineRHR}
              threshold={78}
              thresholdDirection="above"
              unit="bpm"
              color="#0E793C"
              activeStep={replayStep}
              isPlaying={isReplaying}
              onStepChange={setReplayStep}
            />
          </div>

          {/* Chart 4: Airway Inflammation State I(t) */}
          <div id="chart-inflammation" className="w-full min-w-0 scroll-mt-20">
            <TelemetryChart
              title="ESTIMATED AIRWAY INFLAMMATION I(t)"
              data={telemetry}
              dataKey="inflammationState"
              baseline={0.30}
              threshold={patient.inflammationThreshold}
              thresholdDirection="above"
              unit="I(t)"
              color="#0E793C"
              minVal={0.0}
              maxVal={1.0}
              activeStep={replayStep}
              isPlaying={isReplaying}
              onStepChange={setReplayStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
