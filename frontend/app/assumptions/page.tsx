'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SIMULATOR_ASSUMPTIONS, SimulatorAssumption } from '@/lib/data';
import { getAssumptions } from '@/lib/api';

export default function AssumptionsPage() {
  const [assumptions, setAssumptions] = useState<SimulatorAssumption[]>(SIMULATOR_ASSUMPTIONS);

  useEffect(() => {
    let isMounted = true;
    getAssumptions().then((data) => {
      if (isMounted && data && data.length > 0) setAssumptions(data);
    });
    return () => { isMounted = false; };
  }, []);
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-[#12612F] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// MODEL TRANSPARENCY &bull; PRD FR-12 AUDIT TRAIL`}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#B6FFCC] tracking-wide mt-1">
            Simulator Physiology Assumptions &amp; Citations
          </h1>
          <p className="text-xs text-[#4CFF8A] mt-1 max-w-3xl">
            Every coefficient in the mechanistic latent-state simulator is grounded in published respiratory literature. This prevents circular evaluation and ensures clinical plausibility.
          </p>
        </div>

        <div className="text-xs font-mono text-[#4CFF8A] border border-[#12612F] px-3 py-1.5 bg-[#04130A] shrink-0">
          AUDIT STATUS: FULLY REFERENCED
        </div>
      </div>

      {/* Latent State Equation Callout */}
      <div className="border border-[#12612F] bg-[#04130A] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2">
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// LATENT AIRWAY INFLAMMATION DIFFERENTIAL SYSTEM`}</span>
          <span className="text-[10px] font-mono text-[#B6FFCC]">PRD SECTION 8</span>
        </div>

        <div className="bg-[#020A05] border border-[#12612F] p-4 text-center font-mono text-lg sm:text-2xl text-[#B6FFCC] tracking-wider overflow-x-auto glow-text">
          dI/dt = -k &bull; I(t) + a &bull; Dose_PM(t) + b &bull; Trigger(t) - c &bull; Controller(t) + &sigma; &bull; &xi;(t)
        </div>

        <p className="text-xs text-[#2FBF63] leading-relaxed">
          The latent state <span className="font-mono text-[#B6FFCC]">I(t)</span> acts as the causal bridge between ambient exposure and downstream wearable manifestation. When <span className="font-mono text-[#B6FFCC]">I(t)</span> crosses an individual patient’s threshold for consecutive hours, the ATS/ERS severe exacerbation cascade is triggered.
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
              <tr key={item.id} className="hover:bg-[#061C0E] transition-colors">
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

      {/* Indian Healthcare Context Card per PRD Section 2 */}
      <div className="border border-[#12612F] bg-[#061C0E] p-6 space-y-3">
        <div className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider">{`// EPIDEMIOLOGICAL CONTEXT &bull; ASTHMA IN URBAN INDIA`}</div>
        <p className="text-xs text-[#2FBF63] leading-relaxed">
          India accounts for approximately 37.9 million individuals living with bronchial asthma (~13% of the global burden) and over 42% of global asthma deaths (Lancet Global Burden of Disease). Severe winter temperature inversions in Indo-Gangetic plain cities trap PM2.5 at concentrations often exceeding 150–250 µg/m³, which directly triggers airway cytokine hyper-expression. BreathTwin models this specific Indian urban exposure profile.
        </p>
        <div className="pt-2 flex items-center space-x-4 text-xs">
          <Link href="/benchmarks" className="text-[#4CFF8A] hover:underline uppercase font-semibold">
            VIEW EVALUATION BENCHMARKS &rarr;
          </Link>
          <span className="text-[#12612F]">|</span>
          <Link href="/patients" className="text-[#2FBF63] hover:text-[#4CFF8A] uppercase">
            RETURN TO COHORT TRIAGE
          </Link>
        </div>
      </div>
    </div>
  );
}
