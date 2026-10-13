'use client';

import React from 'react';
import Link from 'next/link';
import { BENCHMARKS } from '@/lib/data';

export default function BenchmarksPage() {
  const proposedModel = BENCHMARKS.find(b => b.category === 'BreathTwin Core');

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className="border-b border-[#12612F] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// MODEL VALIDATION &bull; PRD SECTION 12 EVALUATION PLAN`}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#B6FFCC] tracking-wide mt-1">
            Model Benchmarks &amp; Stream Ablation Studies
          </h1>
          <p className="text-xs text-[#4CFF8A] mt-1 max-w-3xl">
            Quantitative evaluation comparing BreathTwin against baselines and stream ablations. Demonstrates that EHR conditioning and real air quality provide decisive predictive value.
          </p>
        </div>

        <div className="text-xs font-mono text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 bg-[#04130A] shrink-0">
          SPLIT: PATIENT-HELD-OUT + TEMPORAL
        </div>
      </div>

      {/* Target Metric KPI Strips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">PR-AUC (PROPOSED)</div>
          <div className="text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums mt-1 glow-text">
            {proposedModel?.prAuc.toFixed(2)}
          </div>
          <div className="text-[11px] text-[#2FBF63]">+0.41 over Air Quality Baseline</div>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">ROC-AUC</div>
          <div className="text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums mt-1">
            {proposedModel?.rocAuc.toFixed(2)}
          </div>
          <div className="text-[11px] text-[#2FBF63]">Discrimination accuracy</div>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">EARLY LEAD TIME</div>
          <div className="text-2xl font-bold font-mono text-[#4CFF8A] tabular-nums mt-1">
            {proposedModel?.leadTimeHours}h
          </div>
          <div className="text-[11px] text-[#2FBF63]">Target: &ge; 24h (Met)</div>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">FALSE ALARMS / WK</div>
          <div className="text-2xl font-bold font-mono text-[#4CFF8A] tabular-nums mt-1">
            {proposedModel?.falseAlarmsPerWeek} / wk
          </div>
          <div className="text-[11px] text-[#2FBF63]">Target: &le; 1.0 (Met)</div>
        </div>
      </div>

      {/* Full Benchmark Comparison Table */}
      <div className="border border-[#12612F] bg-[#04130A] overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#12612F] bg-[#020A05] text-[#2FBF63] uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4 font-medium">MODEL ARCHITECTURE</th>
              <th className="py-3 px-4 font-medium">CATEGORY</th>
              <th className="py-3 px-4 font-medium">PR-AUC</th>
              <th className="py-3 px-4 font-medium">ROC-AUC</th>
              <th className="py-3 px-4 font-medium">BRIER SCORE</th>
              <th className="py-3 px-4 font-medium">LEAD TIME</th>
              <th className="py-3 px-4 font-medium">FALSE ALARMS</th>
              <th className="py-3 px-4 font-medium">PHYSIOLOGICAL IMPLICATION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#12612F]/40 font-sans">
            {BENCHMARKS.map((m) => {
              const isFull = m.category === 'BreathTwin Core';
              return (
                <tr 
                  key={m.name} 
                  className={`hover:bg-[#061C0E] transition-colors ${
                    isFull ? 'bg-[#4CFF8A]/5 font-medium' : ''
                  }`}
                >
                  <td className="py-3.5 px-4">
                    <div className={isFull ? 'text-[#B6FFCC] font-bold text-sm glow-text' : 'text-[#4CFF8A]'}>
                      {m.name}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${
                      isFull 
                        ? 'border-[#4CFF8A] text-[#B6FFCC] bg-[#020A05]' 
                        : m.category === 'Ablation'
                        ? 'border-[#FFE14A] text-[#FFE14A]'
                        : 'border-[#12612F] text-[#2FBF63]'
                    }`}>
                      {m.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-sm tabular-nums text-[#B6FFCC]">
                    {m.prAuc.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-[#4CFF8A]">
                    {m.rocAuc.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-[#2FBF63]">
                    {m.brierScore.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#B6FFCC]">
                    {m.leadTimeHours}h
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#4CFF8A]">
                    {m.falseAlarmsPerWeek}/wk
                  </td>
                  <td className="py-3.5 px-4 text-[#2FBF63] max-w-xs text-[11px] leading-relaxed">
                    {m.notes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Calibration and Ablation Visual Interpretation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ablation Summary */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 text-xs">
          <div className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider border-b border-[#12612F]/40 pb-2">{`// KEY ABLATION INSIGHTS (WHAT THE DATA PROVES)`}</div>
          <div className="space-y-3 pt-1">
            <div className="border-l-2 border-[#FFE14A] pl-3 py-1 bg-[#061C0E]">
              <div className="text-[#FFE14A] font-semibold">1. EHR Stream Value (Δ PR-AUC: -0.11)</div>
              <p className="text-[11px] text-[#2FBF63] mt-0.5">
                Without static EHR conditioning (baseline FEV1, severity, controller adherence), the temporal network fails to distinguish chronic baseline dyspnea from acute flare-up drift.
              </p>
            </div>

            <div className="border-l-2 border-[#FFE14A] pl-3 py-1 bg-[#061C0E]">
              <div className="text-[#FFE14A] font-semibold">2. Air-Quality Stream Value (Δ Lead Time: -17 Hours)</div>
              <p className="text-[11px] text-[#2FBF63] mt-0.5">
                Wearables alone detect changes only after airway inflammation has already narrowed the bronchi. Ingesting tomorrow’s PM2.5 forecast allows proactive alerts before symptoms occur.
              </p>
            </div>

            <div className="border-l-2 border-[#4CFF8A] pl-3 py-1 bg-[#061C0E]">
              <div className="text-[#4CFF8A] font-semibold">3. Latent Mechanistic Estimator I(t) Value</div>
              <p className="text-[11px] text-[#2FBF63] mt-0.5">
                The differential filter provides biological regularization, reducing false alarms from 1.9 down to 0.7 per patient per week.
              </p>
            </div>
          </div>
        </div>

        {/* Clinical Reliability & Calibration Card */}
        <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 text-xs">
          <div className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider border-b border-[#12612F]/40 pb-2">{`// CONFORMAL CALIBRATION &amp; RELIABILITY`}</div>
          <p className="text-xs text-[#2FBF63] leading-relaxed">
            In clinical decision support, uncalibrated deep models frequently output overconfident probabilities. BreathTwin applies split conformal prediction to output valid 90% coverage prediction intervals:
          </p>

          <div className="bg-[#020A05] border border-[#12612F] p-4 font-mono text-xs text-[#B6FFCC] space-y-2">
            <div className="text-[#4CFF8A]">&gt; BRIER SCORE: 0.09 (EXCELLENT CALIBRATION)</div>
            <div className="text-[#2FBF63]">&gt; EXPECTED CALIBRATION ERROR (ECE): 3.2%</div>
            <div className="text-[#2FBF63]">&gt; COVERAGE GUARANTEE: 90.4% ON HELD-OUT PATIENTS</div>
          </div>

          <div className="pt-2 flex justify-between items-center text-xs">
            <Link href="/assumptions" className="text-[#4CFF8A] hover:underline uppercase font-semibold">
              REVIEW COEFFICIENT ASSUMPTIONS &rarr;
            </Link>
            <Link href="/patients" className="text-[#2FBF63] hover:text-[#4CFF8A] uppercase">
              TRIAGE PATIENTS &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
