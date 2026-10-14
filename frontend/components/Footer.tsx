'use client';

import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[#12612F] bg-[#020A05] text-[#75FFA5] py-10 px-4 sm:px-6">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          {/* Col 1 */}
          <div className="space-y-2.5">
            <div className="text-white font-bold tracking-wider uppercase text-base">
              BREATHTWIN // DIGITAL TWIN CORE
            </div>
            <p className="text-[#75FFA5] text-sm leading-relaxed">
              A hybrid mechanistic-neural digital twin for asthma flare-up prediction (24–48h horizon), fusing synthetic EHR, continuous wearable signals, and real Indian ambient air quality.
            </p>
            <div className="text-xs font-mono font-semibold text-[#4CFF8A]">
              STATUS: DEPLOYED // DEMO V1.0
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2.5">
            <div className="text-white font-bold tracking-wider uppercase text-xs sm:text-sm font-mono">{`// FRONTEND ENDPOINTS`}</div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href="/" className="hover:text-white hover:underline">
                  / &mdash; System Landing &amp; Overview
                </Link>
              </li>
              <li>
                <Link href="/patients" className="hover:text-white hover:underline">
                  /patients &mdash; Cohort Risk Triage
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821" className="hover:text-white hover:underline">
                  /patients/:id &mdash; Patient Digital Twin
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821/forecast" className="hover:text-white hover:underline">
                  /patients/:id/forecast &mdash; 48h Risk &amp; SHAP
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821/what-if" className="hover:text-white hover:underline">
                  /patients/:id/what-if &mdash; Counterfactual Sandbox
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="space-y-2.5">
            <div className="text-white font-bold tracking-wider uppercase text-xs sm:text-sm font-mono">{`// AUDIT & VALIDATION`}</div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href="/assumptions" className="hover:text-white hover:underline">
                  /assumptions &mdash; Latent Coefficients &amp; Citations
                </Link>
              </li>
              <li>
                <Link href="/benchmarks" className="hover:text-white hover:underline">
                  /benchmarks &mdash; Ablations &amp; Model Metrics
                </Link>
              </li>
              <li>
                <Link href="/patient-preview" className="hover:text-white hover:underline">
                  /patient-preview &mdash; Patient Alert Mobile View
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div className="space-y-2.5 border border-[#12612F] p-4 bg-[#04130A]">
            <div className="text-[#FFE14A] font-bold tracking-wider uppercase text-xs flex items-center">
              <span className="w-2 h-2 bg-[#FFE14A] mr-2 inline-block" />
              MANDATORY CLINICAL DISCLAIMER
            </div>
            <p className="text-xs sm:text-[13px] leading-relaxed text-[#75FFA5]">
              THIS IS A RESEARCH PROTOTYPE, NOT MEDICAL ADVICE. All patient profiles are synthetic and generated for causal validation. The system does not diagnose or prescribe treatment.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#12612F]/50 pt-5 flex flex-col sm:flex-row items-center justify-between text-xs sm:text-sm tracking-wider uppercase text-[#75FFA5]">
          <div>
            &copy; 2026 BREATHTWIN · ASTHMA DIGITAL TWIN PROJECT
          </div>
          <div className="font-mono text-white mt-2 sm:mt-0 font-medium">
            NIGHT-VISION PHOSPHOR THEME // 100% GREEN ON NEAR-BLACK
          </div>
        </div>
      </div>
    </footer>
  );
}
