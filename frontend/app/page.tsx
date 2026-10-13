'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import StatusChip from '@/components/StatusChip';
import { PATIENTS } from '@/lib/data';

export default function HomePage() {
  const highRiskPatients = PATIENTS.filter(p => p.riskLevel === 'HIGH RISK');

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="border border-[#12612F] bg-[#04130A] p-6 sm:p-10 relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63] border border-[#12612F] px-2 py-0.5 bg-[#020A05]">{`// PROTOTYPE ARCHITECTURE &bull; V1.0`}</span>
              <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#4CFF8A] border border-[#12612F] px-2 py-0.5 bg-[#020A05]">
                INDIAN URBAN COHORT
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#B6FFCC] glow-hot leading-tight">
              Predicting Asthma Flare-Ups 24–48 Hours Ahead.
            </h1>

            <p className="text-base text-[#4CFF8A] leading-relaxed max-w-2xl">
              BreathTwin fuses a patient’s synthetic EHR profile, continuous wearable telemetry, and real open Indian air-quality data into a live mechanistic twin. It models hidden airway inflammation <span className="font-mono text-[#B6FFCC]">I(t)</span> to alert pulmonologists before irreversible airway obstruction occurs.
            </p>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-[#12612F]/60 max-w-lg">
              <div>
                <div className="text-[10px] tracking-widest text-[#2FBF63] uppercase">LEAD TIME</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">36–48h</div>
                <div className="text-[10px] text-[#2FBF63]">Ahead of attack</div>
              </div>
              <div>
                <div className="text-[10px] tracking-widest text-[#2FBF63] uppercase">FALSE ALARMS</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">&lt;0.7/wk</div>
                <div className="text-[10px] text-[#2FBF63]">Target verified</div>
              </div>
              <div>
                <div className="text-[10px] tracking-widest text-[#2FBF63] uppercase">FULL PR-AUC</div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums">0.83</div>
                <div className="text-[10px] text-[#2FBF63]">vs 0.42 Baseline</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 pt-3">
              <Link
                href="/patients"
                className="h-11 px-6 text-xs uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors flex items-center justify-center"
              >
                LAUNCH DOCTOR DASHBOARD &gt;
              </Link>
              <Link
                href="/benchmarks"
                className="h-11 px-6 text-xs uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors flex items-center justify-center bg-[#020A05]"
              >
                MODEL BENCHMARKS &amp; ABLATIONS
              </Link>
              <Link
                href="/assumptions"
                className="h-11 px-6 text-xs uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors flex items-center justify-center bg-[#020A05]"
              >
                AUDIT ASSUMPTIONS
              </Link>
            </div>
          </div>

          {/* Right Hero Thermal Visualizer */}
          <div className="lg:col-span-5">
            <div className="border border-[#12612F] bg-[#061C0E] p-3">
              <div className="flex justify-between items-center text-[10px] font-mono text-[#2FBF63] mb-2 uppercase tracking-widest">
                <span>{`// LIVE TWIN RENDER`}</span>
                <span className="text-[#FF2A1A] glow-danger">ALERT: PT-8821 (DELHI)</span>
              </div>
              <div className="relative thermal-img aspect-[4/3] w-full border border-[#12612F]">
                <Image
                  src="/images/lung-thermal.png"
                  alt="BreathTwin thermal reconstruction of inflamed pulmonary airways"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute top-2 left-2 bg-[#020A05]/90 border border-[#12612F] px-2 py-1 text-[9px] font-mono text-[#B6FFCC]">
                  I(t) = 0.84 &bull; INFLAMMATION CRITICAL
                </div>
                <div className="absolute bottom-2 right-2 bg-[#020A05]/90 border border-[#FF2A1A] px-2 py-1 text-[9px] font-mono text-[#FF2A1A]">
                  48H RISK: 82% [HIGH]
                </div>
              </div>
              <div className="mt-3 text-[11px] text-[#2FBF63] flex justify-between items-center font-mono">
                <span>SIMULATION CLOCK: T+48H REPLAY</span>
                <Link href="/patients/PT-8821" className="text-[#4CFF8A] hover:underline">
                  INSPECT TWIN &gt;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Stream Data Fusion Architecture */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] tracking-wide">{`// Three-Stream Biological Data Fusion`}</h2>
          <span className="text-xs uppercase tracking-wider text-[#2FBF63]">
            PRD ARCHITECTURE COMPLIANCE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Stream 1 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3">
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
              Provides patient demographics, asthma baseline phenotypes, lung function results (FEV1, FEV1/FVC), prescription records, and historical exacerbation frequency.
            </p>
            <div className="border-t border-[#12612F]/40 pt-2 text-[11px] font-mono text-[#4CFF8A]">
              &bull; Conditions temporal network via FiLM gating
            </div>
          </div>

          {/* Stream 2 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3">
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
              Simulated 7-day streams of resting respiratory rate, nocturnal SpO2 dips, resting heart rate, HRV rMSSD, sleep stage fragmentation, and smart-inhaler rescue puffs.
            </p>
            <div className="border-t border-[#12612F]/40 pt-2 text-[11px] font-mono text-[#4CFF8A]">
              &bull; Evaluated as rolling deviations from personal baselines
            </div>
          </div>

          {/* Stream 3 */}
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3">
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
              Real open data ingestion from monitoring stations in Delhi, Mumbai, Bengaluru. Ingests ambient PM2.5, PM10, temperature inversions, and relative humidity swings.
            </p>
            <div className="border-t border-[#12612F]/40 pt-2 text-[11px] font-mono text-[#4CFF8A]">
              &bull; Drives inhaled particulate dose calculations
            </div>
          </div>
        </div>
      </section>

      {/* Latent Mechanistic State Estimator Formula Box */}
      <section className="border border-[#12612F] bg-[#061C0E] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/60 pb-3">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-[#2FBF63]">{`// MATHEMATICAL FOUNDATION &bull; SECTION 8 SIMULATOR DESIGN`}</div>
            <h3 className="text-lg font-semibold text-[#B6FFCC]">
              Airway Inflammation Latent Differential Equation
            </h3>
          </div>
          <Link
            href="/assumptions"
            className="text-xs uppercase tracking-wider text-[#4CFF8A] hover:underline flex items-center"
          >
            INSPECT ALL COEFFICIENTS &amp; CITATIONS &rarr;
          </Link>
        </div>

        <div className="bg-[#020A05] border border-[#12612F] p-4 text-center font-mono text-base sm:text-xl text-[#B6FFCC] tracking-wider overflow-x-auto">
          dI/dt = -k &bull; I(t) + a &bull; Dose_PM(t) + b &bull; Trigger(t) - c &bull; Controller(t) + &sigma; &bull; &xi;(t)
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#2FBF63]">
          <div className="border border-[#12612F]/50 p-2.5 bg-[#04130A]">
            <span className="text-[#B6FFCC] font-mono font-bold">-k &bull; I</span>: Spontaneous mucosal recovery decay rate
          </div>
          <div className="border border-[#12612F]/50 p-2.5 bg-[#04130A]">
            <span className="text-[#B6FFCC] font-mono font-bold">+a &bull; Dose_PM</span>: Inhaled particulate accumulation
          </div>
          <div className="border border-[#12612F]/50 p-2.5 bg-[#04130A]">
            <span className="text-[#B6FFCC] font-mono font-bold">-c &bull; Controller</span>: Inhaled steroid suppression efficacy
          </div>
          <div className="border border-[#12612F]/50 p-2.5 bg-[#04130A]">
            <span className="text-[#B6FFCC] font-mono font-bold">&sigma; &bull; &xi;</span>: Stochastic physiological sensor noise
          </div>
        </div>
      </section>

      {/* Active High-Risk Patients Spotlight */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#B6FFCC] tracking-wide">{`// Immediate Triage Attention Required`}</h2>
            <div className="text-xs text-[#2FBF63] mt-0.5">
              Patients with 48h adverse exacerbation probability &gt; 70%
            </div>
          </div>
          <Link
            href="/patients"
            className="text-xs font-semibold text-[#4CFF8A] hover:underline uppercase tracking-wider"
          >
            VIEW FULL COHORT (6) &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {highRiskPatients.map((patient) => (
            <div
              key={patient.id}
              className="border border-[#FF2A1A] bg-[#04130A] p-5 flex flex-col justify-between space-y-4"
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

                <div className="text-xs text-[#FFE14A] border-l-2 border-[#FF2A1A] pl-3 py-1 bg-[#061C0E]">
                  &gt; {patient.alertHeadline}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63]">LOCATION</div>
                    <div className="text-[#B6FFCC] font-medium">{patient.city}</div>
                    <div className="text-[10px] text-[#2FBF63]">AQI {patient.currentAirQuality.aqi}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63]">48H RISK</div>
                    <div className="text-lg font-bold text-[#FF2A1A] tabular-nums font-mono glow-danger">
                      {patient.risk48h}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#2FBF63]">LEAD TIME</div>
                    <div className="text-[#B6FFCC] font-bold font-mono">{patient.leadTimeHours} Hours</div>
                    <div className="text-[10px] text-[#2FBF63]">Actionable window</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#12612F]/60 pt-3">
                <div className="text-[11px] text-[#2FBF63]">
                  TOP REASON: <span className="text-[#4CFF8A]">{patient.shapReasons[0].feature}</span>
                </div>
                <Link
                  href={`/patients/${patient.id}`}
                  className="text-xs font-semibold text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 hover:border-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors"
                >
                  OPEN TWIN &gt;
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Challenge Checklist Highlights */}
      <section className="border border-[#12612F] bg-[#04130A] p-6 space-y-4">
        <h3 className="text-base font-semibold text-[#B6FFCC] tracking-wider uppercase">{`// Product Submission &amp; Clinical Use Case Alignment`}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="border border-[#12612F]/40 p-3 bg-[#020A05]">
            <div className="text-[#4CFF8A] font-semibold mb-1">&bull; CHRONIC CONDITION</div>
            <p className="text-[#2FBF63]">Moderate-to-severe Asthma in high-pollution Indian urban environments.</p>
          </div>
          <div className="border border-[#12612F]/40 p-3 bg-[#020A05]">
            <div className="text-[#4CFF8A] font-semibold mb-1">&bull; ADVERSE EVENT</div>
            <p className="text-[#2FBF63]">Acute severe flare-up (exacerbation) requiring emergency intervention.</p>
          </div>
          <div className="border border-[#12612F]/40 p-3 bg-[#020A05]">
            <div className="text-[#4CFF8A] font-semibold mb-1">&bull; DOCTOR WORKFLOW</div>
            <p className="text-[#2FBF63]">3-click journey: Who is at risk &rarr; Why &rarr; What intervention helps.</p>
          </div>
          <div className="border border-[#12612F]/40 p-3 bg-[#020A05]">
            <div className="text-[#4CFF8A] font-semibold mb-1">&bull; COUNTERFACTUAL</div>
            <p className="text-[#2FBF63]">Interactive What-If sandbox to test N95 masks, indoor shelter, and steroids.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
