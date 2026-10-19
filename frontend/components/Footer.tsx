'use client';

import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[#12612F] bg-[#020A05] text-[#75FFA5] py-8 px-4 sm:px-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-white font-bold tracking-wider uppercase text-sm">
              BREATHTWIN
            </div>
            <p className="text-[#75FFA5] text-xs sm:text-sm leading-relaxed">
              Hybrid mechanistic-neural digital twin for 48-hour asthma flare-up risk forecasting, fusing longitudinal EHR, wearable physiology, and ambient CPCB air quality.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <Link href="/patients" className="text-[#4CFF8A] hover:text-white hover:underline uppercase">
              Cohort Triage
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link href="/benchmarks" className="text-[#4CFF8A] hover:text-white hover:underline uppercase">
              Validation &amp; Benchmarks
            </Link>
            <span className="text-[#12612F]">|</span>
            <Link href="/assumptions" className="text-[#4CFF8A] hover:text-white hover:underline uppercase">
              Model Assumptions
            </Link>
          </div>
        </div>

        <div className="border-t border-[#12612F]/50 pt-4 flex flex-col sm:flex-row items-center justify-between text-xs tracking-wider uppercase text-[#75FFA5]">
          <div>
            &copy; 2026 BREATHTWIN
          </div>
        </div>
      </div>
    </footer>
  );
}
