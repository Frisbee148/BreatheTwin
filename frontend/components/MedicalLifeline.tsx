'use client';

import React from 'react';

// Single medical ECG cycle definition (Lead II cardiac rhythm):
// Width: 360px | Baseline: y = 120 | Height: 240px
// Features: P-wave (atrial), Q-dip, massive R-spike (ventricular, y=20), S-plunge (y=210), T-wave (repolarization)
function generateSeamlessEcgPath(
  numCycles: number = 24,
  cycleWidth: number = 360,
  baseline: number = 120
): string {
  let d = `M 0,${baseline} `;
  for (let i = 0; i < numCycles; i++) {
    const x = i * cycleWidth;
    d +=
      `L ${x + 65},${baseline} ` +
      `C ${x + 75},${baseline} ${x + 82},${baseline - 16} ${x + 92},${baseline - 16} ` +
      `C ${x + 102},${baseline - 16} ${x + 108},${baseline} ${x + 118},${baseline} ` +
      `L ${x + 140},${baseline} ` +
      `L ${x + 150},${baseline + 16} ` +
      `L ${x + 162},${baseline - 100} ` +
      `L ${x + 174},${baseline + 90} ` +
      `L ${x + 185},${baseline} ` +
      `L ${x + 210},${baseline} ` +
      `C ${x + 224},${baseline} ${x + 232},${baseline - 32} ${x + 242},${baseline - 32} ` +
      `C ${x + 252},${baseline - 32} ${x + 260},${baseline} ${x + 274},${baseline} ` +
      `L ${x + cycleWidth},${baseline} `;
  }
  return d;
}

const TOTAL_CYCLES = 24;
const CYCLE_WIDTH = 360;
const TOTAL_WIDTH = TOTAL_CYCLES * CYCLE_WIDTH; // 8640px
const ECG_PATH_DATA = generateSeamlessEcgPath(TOTAL_CYCLES, CYCLE_WIDTH, 120);

export default function MedicalLifeline() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      {/* Viewport for Medical Lifeline & Subtle Millimeter Grid */}
      <div className="absolute top-10 sm:top-14 lg:top-16 left-0 right-0 h-64 sm:h-80 lg:h-96 overflow-hidden">
        {/* Static Medical Millimeter Grid Background */}
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <pattern
              id="medical-lifeline-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                strokeWidth="0.5"
                className="lifeline-grid-stroke"
              />
              <circle
                cx="20"
                cy="20"
                r="1"
                className="lifeline-grid-dot"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#medical-lifeline-grid)" />
        </svg>

        {/* Continuous Looping Horizontal Lifeline Track */}
        <div className="absolute inset-0 overflow-hidden flex items-center">
          <div
            className="flex-none h-full"
            style={{ width: `${TOTAL_WIDTH}px` }}
          >
            <svg
              viewBox={`0 0 ${TOTAL_WIDTH} 240`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
            >
              <g>
                <path
                  d={ECG_PATH_DATA}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lifeline-path text-[#0E793C] dark:text-white"
                />
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to="-360 0"
                  dur="3.6s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
