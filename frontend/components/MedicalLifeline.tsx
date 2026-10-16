'use client';

import React from 'react';

export default function MedicalLifeline() {
  // Realistic medical ECG P-Q-R-S-T wave pattern across 4 cardiac cycles (1600px width)
  // Baseline is at y = 130. ViewBox is 0 0 1600 260.
  // R-spike peaks up to y = 15 (amplitude 115px).
  // S-dip plunges down to y = 225 (amplitude 95px).
  // Peak-to-peak amplitude is 210px for bold medical visibility!
  const ecgPath =
    'M 0,130 ' +
    // Cardiac Cycle 1 (0 -> 400)
    'L 80,130 C 92,130 98,110 105,110 C 112,110 118,130 130,130 L 155,130 L 165,145 L 177,15 L 189,225 L 198,122 L 205,130 L 225,130 C 240,130 250,90 260,90 C 270,90 275,130 285,130 L 400,130 ' +
    // Cardiac Cycle 2 (400 -> 800)
    'L 480,130 C 492,130 498,110 505,110 C 512,110 518,130 530,130 L 555,130 L 565,145 L 577,15 L 589,225 L 598,122 L 605,130 L 625,130 C 640,130 650,90 660,90 C 670,90 675,130 685,130 L 800,130 ' +
    // Cardiac Cycle 3 (800 -> 1200)
    'L 880,130 C 892,130 898,110 905,110 C 912,110 918,130 930,130 L 955,130 L 965,145 L 977,15 L 989,225 L 998,122 L 1005,130 L 1025,130 C 1040,130 1050,90 1060,90 C 1070,90 1075,130 1085,130 L 1200,130 ' +
    // Cardiac Cycle 4 (1200 -> 1600)
    'L 1280,130 C 1292,130 1298,110 1305,110 C 1312,110 1318,130 1330,130 L 1355,130 L 1365,145 L 1377,15 L 1389,225 L 1398,122 L 1405,130 L 1425,130 C 1440,130 1450,90 1460,90 C 1470,90 1475,130 1485,130 L 1600,130';

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      {/* Telemetry Horizon Header */}
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-1 flex items-center justify-between text-xs font-mono tracking-widest uppercase lifeline-telemetry-text">
        <span className="flex items-center space-x-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full animate-ping bg-[#0E793C] dark:bg-white" />
          <span className="font-bold">◈ LIVE VITAL SIGNS TELEMETRY // LEAD II ECG</span>
        </span>
        <span className="hidden sm:inline font-semibold">
          CAL: 25mm/s &bull; GAIN: 10mm/mV &bull; HR: 72 BPM &bull; SINUS RHYTHM
        </span>
      </div>

      {/* SVG Medical Lifeline Viewport */}
      <div className="relative w-full h-64 sm:h-80 lg:h-96">
        <svg
          viewBox="0 0 1600 260"
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Medical Millimeter Grid Pattern */}
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

          {/* Medical Telemetry Grid Background */}
          <rect width="1600" height="260" fill="url(#medical-lifeline-grid)" />

          {/* 1. Base Static Guide Line (Clearly visible medical track) */}
          <path
            d={ecgPath}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lifeline-base-path"
          />

          {/* 2. Active Animated Pulse Beam (Trailing ECG Wave) */}
          <path
            d={ecgPath}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="400 3700"
            className="lifeline-pulse-path animate-lifeline-sweep"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="4100"
              to="0"
              dur="3.8s"
              repeatCount="indefinite"
            />
          </path>

          {/* 3. Leading Pulse Head (Intense Phosphor Vital Spark) */}
          <path
            d={ecgPath}
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="50 3700"
            className="lifeline-head-path animate-lifeline-sweep"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="4100"
              to="0"
              dur="3.8s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      </div>
    </div>
  );
}
