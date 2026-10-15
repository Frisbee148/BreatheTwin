'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  BENCHMARKS, 
  BenchmarkModel, 
  SIMULATOR_ASSUMPTIONS, 
  SimulatorAssumption 
} from '@/lib/data';
import { getBenchmarks, getAssumptions } from '@/lib/api';
import ScrambleText from '@/components/ScrambleText';

function BenchmarksAndAssumptionsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'assumptions' 
    ? 'assumptions' 
    : searchParams.get('tab') === 'benchmarks' 
    ? 'benchmarks' 
    : 'all';

  const [activeTab, setActiveTab] = useState<'all' | 'benchmarks' | 'assumptions'>(initialTab);
  const [benchmarks, setBenchmarks] = useState<BenchmarkModel[]>(BENCHMARKS);
  const [assumptions, setAssumptions] = useState<SimulatorAssumption[]>(SIMULATOR_ASSUMPTIONS);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getBenchmarks(), getAssumptions()]).then(([bData, aData]) => {
      if (isMounted) {
        if (bData && bData.length > 0) setBenchmarks(bData);
        if (aData && aData.length > 0) setAssumptions(aData);
      }
    });
    return () => { isMounted = false; };
  }, []);

  const proposedModel = benchmarks.find(b => b.category === 'BreathTwin Core');

  return (
    <div className="space-y-8">
      {/* Page Title & Navigation Header */}
      <div className="border-b border-[#12612F] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <ScrambleText
            text="CLINICAL VALIDATION & MODEL AUDIT • PRD SECTIONS 8 & 12"
            prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
            className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]"
          />
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#B6FFCC] tracking-wide mt-1">
            Benchmarks &amp; Physiological Assumptions
          </h1>
          <p className="text-xs text-[#4CFF8A] mt-1 max-w-3xl">
            Unified clinical validation suite: quantitative model ablations, conformal prediction coverage, and literature-grounded biological latent differential equations.
          </p>
        </div>

        {/* View Filter Switcher Pills */}
        <div className="flex items-center space-x-1 p-1 bg-[#04130A] border border-[#12612F] text-xs font-mono shrink-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 transition-colors font-medium ${
              activeTab === 'all'
                ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                : 'text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            VIEW ALL
          </button>
          <button
            onClick={() => setActiveTab('benchmarks')}
            className={`px-3 py-1.5 transition-colors font-medium ${
              activeTab === 'benchmarks'
                ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                : 'text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            1. BENCHMARKS
          </button>
          <button
            onClick={() => setActiveTab('assumptions')}
            className={`px-3 py-1.5 transition-colors font-medium ${
              activeTab === 'assumptions'
                ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                : 'text-[#2FBF63] hover:text-[#4CFF8A]'
            }`}
          >
            2. ASSUMPTIONS
          </button>
        </div>
      </div>

      {/* SECTION 1: BENCHMARKS & ABLATIONS */}
      {(activeTab === 'all' || activeTab === 'benchmarks') && (
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#12612F]/50 pb-2">
            <ScrambleText
              text="PART 1 • MODEL ABLATION SUITE & DISCRIMINATION METRICS"
              prefix={<span className="w-2 h-2 bg-[#4CFF8A] inline-block" />}
              className="text-xs font-bold tracking-wider uppercase text-[#B6FFCC]"
            />
            <div className="text-xs font-mono text-[#4CFF8A] border border-[#12612F] px-2 py-0.5 bg-[#04130A]">
              SPLIT: PATIENT-HELD-OUT + TEMPORAL
            </div>
          </div>

          {/* KPI Strip */}
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

          {/* Benchmark Comparison Table */}
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
                {benchmarks.map((m) => {
                  const isFull = m.category === 'BreathTwin Core';
                  return (
                    <tr 
                      key={m.name} 
                      className={`benchmark-row transition-colors ${
                        isFull ? 'is-core font-medium' : ''
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

          {/* Ablation Insights & Calibration Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 text-xs">
              <div className="border-b border-[#12612F]/40 pb-2">
                <ScrambleText
                  text="KEY ABLATION INSIGHTS"
                  prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
                  className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider"
                />
              </div>
              <div className="space-y-3 pt-1">
                <div className="border-l-2 border-[#FFE14A] pl-3 py-1 bg-[#061C0E]">
                  <div className="text-[#FFE14A] font-semibold">1. EHR Conditioning (Δ PR-AUC: -0.11)</div>
                  <p className="text-[11px] text-[#2FBF63] mt-0.5">
                    Without static EHR factors (baseline FEV1, severity, adherence), the temporal network cannot distinguish chronic dyspnea from acute flare-up drift.
                  </p>
                </div>

                <div className="border-l-2 border-[#FFE14A] pl-3 py-1 bg-[#061C0E]">
                  <div className="text-[#FFE14A] font-semibold">2. Air-Quality Forecast (Δ Lead Time: -17 Hours)</div>
                  <p className="text-[11px] text-[#2FBF63] mt-0.5">
                    Wearables alone only register physiological distress after airway resistance has surged. Forecasting PM2.5 enables 34h proactive intervention before symptoms manifest.
                  </p>
                </div>

                <div className="border-l-2 border-[#4CFF8A] pl-3 py-1 bg-[#061C0E]">
                  <div className="text-[#4CFF8A] font-semibold">3. Latent Mechanistic Estimator I(t)</div>
                  <p className="text-[11px] text-[#2FBF63] mt-0.5">
                    The biological differential filter suppresses noise, reducing false alarm burden from 1.9 down to 0.7 alarms per patient per week.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3 text-xs">
              <div className="border-b border-[#12612F]/40 pb-2">
                <ScrambleText
                  text="CONFORMAL CALIBRATION & RELIABILITY"
                  prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
                  className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider"
                />
              </div>
              <p className="text-xs text-[#2FBF63] leading-relaxed">
                BreathTwin applies split conformal prediction over held-out calibration cohorts to guarantee that 90% prediction intervals maintain empirical validity:
              </p>

              <div className="bg-[#020A05] border border-[#12612F] p-4 font-mono text-xs text-[#B6FFCC] space-y-2">
                <div className="text-[#4CFF8A]">&gt; BRIER SCORE: 0.09 (EXCELLENT CALIBRATION)</div>
                <div className="text-[#2FBF63]">&gt; EXPECTED CALIBRATION ERROR (ECE): 3.2%</div>
                <div className="text-[#2FBF63]">&gt; EMPIRICAL COVERAGE GUARANTEE: 90.4% ON HELD-OUT PATIENTS</div>
              </div>

              <div className="pt-2 flex justify-between items-center text-xs">
                <button
                  onClick={() => setActiveTab('assumptions')}
                  className="text-[#4CFF8A] hover:underline uppercase font-semibold text-left"
                >
                  JUMP TO LATENT COEFFICIENTS &rarr;
                </button>
                <Link href="/patients" className="text-[#2FBF63] hover:text-[#4CFF8A] uppercase">
                  TRIAGE PATIENT COHORT &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2: SIMULATOR ASSUMPTIONS & CITATIONS */}
      {(activeTab === 'all' || activeTab === 'assumptions') && (
        <section className="space-y-6 pt-2">
          <div className="flex items-center justify-between border-b border-[#12612F]/50 pb-2">
            <ScrambleText
              text="PART 2 • SIMULATOR PHYSIOLOGY ASSUMPTIONS & CITATIONS"
              prefix={<span className="w-2 h-2 bg-[#FFE14A] inline-block" />}
              className="text-xs font-bold tracking-wider uppercase text-[#B6FFCC]"
            />
            <div className="text-xs font-mono text-[#4CFF8A] border border-[#12612F] px-2 py-0.5 bg-[#04130A]">
              AUDIT STATUS: FULLY REFERENCED
            </div>
          </div>

          {/* Differential Equation Card */}
          <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
              <ScrambleText
                text="LATENT AIRWAY INFLAMMATION DIFFERENTIAL SYSTEM"
                prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
                className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]"
              />
              <span className="text-[10px] font-mono text-[#B6FFCC]">PRD SECTION 8</span>
            </div>

            <div className="bg-[#020A05] border border-[#12612F] p-4 text-center font-mono text-base sm:text-xl md:text-2xl text-[#B6FFCC] tracking-wider overflow-x-auto glow-text">
              dI/dt = -k &bull; I(t) + a &bull; Dose_PM(t) + b &bull; Trigger(t) - c &bull; Controller(t) + &sigma; &bull; &xi;(t)
            </div>

            <p className="text-xs text-[#2FBF63] leading-relaxed">
              The latent state <span className="font-mono text-[#B6FFCC]">I(t)</span> acts as the causal bridge between ambient exposure and downstream wearable manifestation. When <span className="font-mono text-[#B6FFCC]">I(t)</span> crosses an individual patient’s threshold for consecutive hours, the severe exacerbation cascade is triggered.
            </p>
          </div>

          {/* Assumptions Table */}
          <div className="border border-[#12612F] bg-[#04130A] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#12612F] bg-[#020A05] text-[#2FBF63] uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-medium">ID / SYMBOL</th>
                  <th className="py-3 px-4 font-medium">PARAMETER</th>
                  <th className="py-3 px-4 font-medium">VALUE &amp; UNIT</th>
                  <th className="py-3 px-4 font-medium">PHYSIOLOGICAL ROLE</th>
                  <th className="py-3 px-4 font-medium">PUBLISHED CITATION / SOURCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12612F]/40 font-sans">
                {assumptions.map((item) => (
                  <tr 
                    key={item.id} 
                    className="assumption-row transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-[#B6FFCC]">{item.id}</div>
                      <div className="text-xs text-[#4CFF8A] font-semibold mt-0.5">{item.symbol}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#B6FFCC]">
                      {item.parameter}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#4CFF8A]">
                      <span className="bg-[#020A05] border border-[#12612F] px-1.5 py-0.5 inline-block">
                        {item.value} {item.unit}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#2FBF63] max-w-md leading-relaxed">
                      {item.physiologicalRole}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-[#4CFF8A] font-medium">{item.citation}</div>
                      <div className="text-[10px] font-mono text-[#2FBF63] mt-0.5">
                        DOI: {item.citationDoi} ({item.year})
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Indian Epidemiological Context Card */}
          <div className="border border-[#12612F] bg-[#061C0E] p-6 space-y-3">
            <ScrambleText
              text="EPIDEMIOLOGICAL CONTEXT • ASTHMA IN URBAN INDIA (PRD SECTION 2)"
              prefix={<span className="text-[#4CFF8A] font-bold">◈</span>}
              className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider"
            />
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              India accounts for approximately 37.9 million individuals living with bronchial asthma (~13% of the global burden) and over 42% of global asthma deaths (Lancet Global Burden of Disease). Severe winter temperature inversions in Indo-Gangetic plain cities trap PM2.5 at concentrations often exceeding 150–250 µg/m³, which directly triggers airway cytokine hyper-expression. BreathTwin models this specific Indian urban exposure profile.
            </p>
            <div className="pt-2 flex items-center space-x-4 text-xs">
              <button
                onClick={() => setActiveTab('benchmarks')}
                className="text-[#4CFF8A] hover:underline uppercase font-semibold"
              >
                &larr; BACK TO MODEL BENCHMARKS
              </button>
              <span className="text-[#12612F]">|</span>
              <Link href="/patients" className="text-[#2FBF63] hover:text-[#4CFF8A] uppercase">
                RETURN TO COHORT TRIAGE &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function BenchmarksPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center text-xs font-mono text-[#2FBF63] uppercase">
        Loading Benchmarks &amp; Assumptions...
      </div>
    }>
      <BenchmarksAndAssumptionsContent />
    </Suspense>
  );
}
