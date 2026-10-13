'use client';

import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[#12612F] bg-[#020A05] text-[#2FBF63] py-8 px-4 sm:px-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
          {/* Col 1 */}
          <div className="space-y-2">
            <div className="text-[#B6FFCC] font-semibold tracking-wider uppercase text-sm">
              BREATHTWIN // DIGITAL TWIN CORE
            </div>
            <p className="text-[#2FBF63] text-xs leading-relaxed">
              A hybrid mechanistic-neural digital twin for asthma flare-up prediction (24–48h horizon), fusing synthetic EHR, continuous wearable signals, and real Indian ambient air quality.
            </p>
            <div className="text-[11px] font-mono text-[#4CFF8A]">
              STATUS: DEPLOYED // DEMO V1.0
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2">
            <div className="text-[#B6FFCC] font-semibold tracking-wider uppercase text-xs">{`// FRONTEND ENDPOINTS`}</div>
            <ul className="space-y-1 text-xs">
              <li>
                <Link href="/" className="hover:text-[#4CFF8A] hover:underline">
                  / &mdash; System Landing & Overview
                </Link>
              </li>
              <li>
                <Link href="/patients" className="hover:text-[#4CFF8A] hover:underline">
                  /patients &mdash; Cohort Risk Triage
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821" className="hover:text-[#4CFF8A] hover:underline">
                  /patients/:id &mdash; Patient Digital Twin
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821/forecast" className="hover:text-[#4CFF8A] hover:underline">
                  /patients/:id/forecast &mdash; 48h Risk & SHAP
                </Link>
              </li>
              <li>
                <Link href="/patients/PT-8821/what-if" className="hover:text-[#4CFF8A] hover:underline">
                  /patients/:id/what-if &mdash; Counterfactual Sandbox
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="space-y-2">
            <div className="text-[#B6FFCC] font-semibold tracking-wider uppercase text-xs">{`// AUDIT & VALIDATION`}</div>
            <ul className="space-y-1 text-xs">
              <li>
                <Link href="/assumptions" className="hover:text-[#4CFF8A] hover:underline">
                  /assumptions &mdash; Latent Coefficients & Citations
                </Link>
              </li>
              <li>
                <Link href="/benchmarks" className="hover:text-[#4CFF8A] hover:underline">
                  /benchmarks &mdash; Ablations & Model Metrics
                </Link>
              </li>
              <li>
                <Link href="/patient-preview" className="hover:text-[#4CFF8A] hover:underline">
                  /patient-preview &mdash; Patient Alert Mobile View
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div className="space-y-2 border border-[#12612F] p-3 bg-[#04130A]">
            <div className="text-[#FFE14A] font-semibold tracking-wider uppercase text-xs flex items-center">
              <span className="w-1.5 h-1.5 bg-[#FFE14A] mr-2 inline-block" />
              MANDATORY CLINICAL DISCLAIMER
            </div>
            <p className="text-[11px] leading-relaxed text-[#2FBF63]">
              THIS IS A RESEARCH PROTOTYPE, NOT MEDICAL ADVICE. All patient profiles are synthetic and generated for causal validation. The system does not diagnose or prescribe treatment.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#12612F]/40 pt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] tracking-wider uppercase text-[#2FBF63]">
          <div>
            &copy; 2026 BREATHTWIN · ASTHMA DIGITAL TWIN PROJECT
          </div>
          <div className="font-mono text-[#4CFF8A] mt-2 sm:mt-0">
            NIGHT-VISION PHOSPHOR THEME // 100% GREEN ON NEAR-BLACK
          </div>
        </div>
      </div>
    </footer>
  );
}
