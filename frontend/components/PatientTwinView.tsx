'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PATIENTS, PATIENT_TELEMETRY_SERIES, Patient, TelemetryPoint } from '@/lib/data';
import { getPatient, getPatientTelemetry } from '@/lib/api';
import PatientNavHeader from '@/components/PatientNavHeader';
import ThermalViewer from '@/components/ThermalViewer';
import TelemetryChart from '@/components/TelemetryChart';
import ScrambleText from '@/components/ScrambleText';

export default function PatientTwinView({ patientId }: { patientId: string }) {
  const initialPatient = PATIENTS.find(p => p.id === patientId) || PATIENTS[0];
  const [patient, setPatient] = useState<Patient>(initialPatient);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>(
    PATIENT_TELEMETRY_SERIES[patientId] || PATIENT_TELEMETRY_SERIES['PT-8821']
  );

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
          if (liveTelem && liveTelem.length > 0) setTelemetry(liveTelem);
        }
      } catch (err) {
        console.warn('Using local cache for patient twin:', err);
      }
    };
    fetchLive();
    return () => { isMounted = false; };
  }, [patientId]);

  return (
    <div className="space-y-6">
      {/* Patient Vital Navigation Header & Tabs */}
      <PatientNavHeader patient={patient} />

      {/* Main Grid: Thermal Twin Viewport + Latent Mechanistic State */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Thermal Pulmonary Twin */}
        <div className="lg:col-span-8">
          <ThermalViewer
            patient={patient}
            patientName={patient.name}
            patientId={patient.id}
            overallStatus={patient.riskLevel}
            imageSrc="/images/lung-thermal.png"
          />
        </div>

        {/* Right Column: Latent Mechanistic State Gauge & Quick EHR */}
        <div className="lg:col-span-4 space-y-5">
          {/* Latent State I(t) Panel */}
          <div className="border border-[#12612F] bg-[#04130A] p-4 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
              <ScrambleText
                text="LATENT AIRWAY STATE I(t)"
                prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
                className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]"
              />
              <span className="text-[10px] font-mono text-[#B6FFCC] border border-[#12612F] px-1.5 py-0.5">
                KALMAN ESTIMATED
              </span>
            </div>

            <div>
              <div className="text-[10px] text-[#2FBF63] uppercase tracking-wider mb-1">
                CURRENT INFLAMMATION LOAD
              </div>
              <div className="flex items-baseline space-x-2">
                <span className={`text-3xl font-bold font-mono tabular-nums ${
                  patient.estimatedInflammationState >= patient.inflammationThreshold 
                    ? 'text-[#FF2A1A] glow-danger' 
                    : 'text-[#4CFF8A]'
                }`}>
                  {patient.estimatedInflammationState.toFixed(2)}
                </span>
                <span className="text-xs text-[#2FBF63]">/ 1.00 max</span>
              </div>
            </div>

            {/* Threshold Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-[#2FBF63]">
                <span>THRESHOLD: {patient.inflammationThreshold.toFixed(2)}</span>
                <span className={patient.estimatedInflammationState >= patient.inflammationThreshold ? 'text-[#FF2A1A] font-bold' : 'text-[#4CFF8A]'}>
                  {patient.estimatedInflammationState >= patient.inflammationThreshold ? '+29% EXCEEDED' : 'WITHIN BUFFER'}
                </span>
              </div>
              <div className="w-full h-3 bg-[#061C0E] border border-[#12612F] relative overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    patient.estimatedInflammationState >= patient.inflammationThreshold 
                      ? 'bg-[#FF2A1A]' 
                      : 'bg-[#4CFF8A]'
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

            <p className="text-[11px] text-[#2FBF63] leading-relaxed pt-1">
              Derived from equation <span className="font-mono text-[#4CFF8A]">dI/dt</span> fusing inhaled PM2.5 dose, cold dry air triggers, minus controller ICS suppression.
            </p>
          </div>

          {/* Quick EHR & Air Quality Snapshot */}
          <div className="border border-[#12612F] bg-[#04130A] p-4 text-xs space-y-3">
            <div className="border-b border-[#12612F]/40 pb-2">
              <ScrambleText
                text="CURRENT AMBIENT & RESCUE METRICS"
                prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
                className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="border border-[#12612F]/40 p-2 bg-[#061C0E]">
                <div className="text-[10px] text-[#2FBF63] uppercase">AMBIENT PM2.5</div>
                <div className="text-base font-bold font-mono text-[#FF2A1A]">
                  {patient.currentAirQuality.pm25} <span className="text-[10px] text-[#2FBF63]">µg/m³</span>
                </div>
                <div className="text-[10px] text-[#2FBF63]">{patient.currentAirQuality.aqiCategory}</div>
              </div>

              <div className="border border-[#12612F]/40 p-2 bg-[#061C0E]">
                <div className="text-[10px] text-[#2FBF63] uppercase">RESCUE PUFFS (24H)</div>
                <div className="text-base font-bold font-mono text-[#FFE14A]">
                  {patient.currentTelemetry.rescuePuffs24h} <span className="text-[10px] text-[#2FBF63]">doses</span>
                </div>
                <div className="text-[10px] text-[#2FBF63]">Baseline: 0-1/day</div>
              </div>
            </div>

            <div className="border-t border-[#12612F]/40 pt-3 flex justify-between items-center">
              <span className="text-[#2FBF63]">NEXT WORKFLOW STEP:</span>
              <Link
                href={`/patients/${patient.id}/forecast`}
                className="text-xs uppercase font-semibold text-[#4CFF8A] hover:underline"
              >
                48H FORECAST &amp; REASONS &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Physiological Time-Series Streams */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F] pb-2">
          <div>
            <h2 className="text-lg font-semibold text-[#B6FFCC] tracking-wide">
              <ScrambleText
                text="DYNAMIC SENSOR TELEMETRY (7-DAY REPLAY)"
                prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              />
            </h2>
            <div className="text-xs text-[#2FBF63]">
              Continuous streams replayed through the simulation clock. Compare live deviations against personal baseline.
            </div>
          </div>
          <span className="text-xs font-mono text-[#4CFF8A] border border-[#12612F] px-2 py-1 bg-[#04130A]">
            SAMPLING: HOURLY AGGREGATE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Chart 1: Resting Respiratory Rate */}
          <TelemetryChart
            title="RESTING RESPIRATORY RATE"
            data={telemetry}
            dataKey="rr"
            baseline={patient.baselineRR}
            threshold={18.0}
            thresholdDirection="above"
            unit="breaths/min"
            color="#4CFF8A"
          />

          {/* Chart 2: Nocturnal SpO2 */}
          <TelemetryChart
            title="NOCTURNAL SPO2 SATURATION"
            data={telemetry}
            dataKey="spo2"
            baseline={96.5}
            threshold={92.0}
            thresholdDirection="below"
            unit="%"
            color="#4CFF8A"
            minVal={88}
            maxVal={100}
          />

          {/* Chart 3: Resting Heart Rate & Autonomic Tone */}
          <TelemetryChart
            title="RESTING HEART RATE (RHR)"
            data={telemetry}
            dataKey="rhr"
            baseline={patient.baselineRHR}
            threshold={78}
            thresholdDirection="above"
            unit="bpm"
            color="#4CFF8A"
          />

          {/* Chart 4: Airway Inflammation State I(t) */}
          <TelemetryChart
            title="ESTIMATED AIRWAY INFLAMMATION I(t)"
            data={telemetry}
            dataKey="inflammationState"
            baseline={0.30}
            threshold={patient.inflammationThreshold}
            thresholdDirection="above"
            unit="I(t)"
            color="#4CFF8A"
            minVal={0.0}
            maxVal={1.0}
          />
        </div>
      </div>
    </div>
  );
}
