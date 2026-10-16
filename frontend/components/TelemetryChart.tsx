'use client';

import React, { useState, useEffect } from 'react';
import { TelemetryPoint } from '@/lib/data';

interface TelemetryChartProps {
  title: string;
  data: TelemetryPoint[];
  dataKey: keyof TelemetryPoint;
  baseline?: number;
  threshold?: number;
  thresholdDirection?: 'above' | 'below';
  unit: string;
  color?: string;
  minVal?: number;
  maxVal?: number;
  activeStep?: number;
  isPlaying?: boolean;
  onStepChange?: (step: number) => void;
}

export default function TelemetryChart({
  title,
  data,
  dataKey,
  baseline,
  threshold,
  thresholdDirection = 'above',
  unit,
  color = '#4CFF8A',
  minVal,
  maxVal,
  activeStep: controlledStep,
  isPlaying = false,
  onStepChange
}: TelemetryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [localStep, setLocalStep] = useState<number | null>(null);
  const [isLocalAnimating, setIsLocalAnimating] = useState(false);

  // Active step (from parent replay controller or local fallback)
  const currentStep = controlledStep !== undefined ? controlledStep : (localStep !== undefined && localStep !== null ? localStep : data.length - 1);

  // Per-chart quick replay animation
  useEffect(() => {
    if (!isLocalAnimating) return;
    let step = 0;
    setLocalStep(0);
    const interval = setInterval(() => {
      step += 1;
      if (step >= data.length) {
        clearInterval(interval);
        setIsLocalAnimating(false);
      } else {
        setLocalStep(step);
      }
    }, 450);
    return () => clearInterval(interval);
  }, [isLocalAnimating, data.length]);

  if (!data || data.length === 0) return null;

  const rawValues = data.map(d => Number(d[dataKey]));
  const computedMin = minVal !== undefined ? minVal : Math.floor(Math.min(...rawValues, baseline ?? Infinity, threshold ?? Infinity) * 0.95);
  const computedMax = maxVal !== undefined ? maxVal : Math.ceil(Math.max(...rawValues, baseline ?? -Infinity, threshold ?? -Infinity) * 1.05);
  const range = computedMax - computedMin || 1;

  // Generous proportions for zero label collision
  const width = 1050;
  const height = 270;
  const paddingLeft = 55;
  const paddingRight = 195; // Dedicated 195px right-margin column exclusively for reference badges
  const paddingTop = 40;
  const paddingBottom = 48;

  const plotWidth = width - paddingLeft - paddingRight; // 800px
  const plotHeight = height - paddingTop - paddingBottom; // 182px

  const getX = (idx: number) => paddingLeft + (idx / (data.length - 1)) * plotWidth;
  const getY = (val: number) => height - paddingBottom - ((val - computedMin) / range) * plotHeight;

  const points = data.map((d, idx) => ({
    x: getX(idx),
    y: getY(Number(d[dataKey])),
    val: Number(d[dataKey]),
    label: d.dayShort || `D${idx + 1}`,
    date: d.date || '',
    day: d.day || `Day ${idx + 1}`
  }));

  // Render path up to currentStep (progressive reveal during animation/scrubbing)
  const activePoints = points.slice(0, currentStep + 1);
  const pathD = activePoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Faint guide path for the remaining future points (if scrubbing)
  const futurePathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const baselineY = baseline !== undefined ? getY(baseline) : null;
  const thresholdY = threshold !== undefined ? getY(threshold) : null;

  // Collision prevention: If baselineY and thresholdY are closer than 26px, stagger them vertically
  let baselineBadgeY = baselineY;
  let thresholdBadgeY = thresholdY;
  if (baselineY !== null && thresholdY !== null) {
    const diff = Math.abs(baselineY - thresholdY);
    if (diff < 26) {
      if (baselineY < thresholdY) {
        baselineBadgeY = baselineY - 14;
        thresholdBadgeY = thresholdY + 14;
      } else {
        baselineBadgeY = baselineY + 14;
        thresholdBadgeY = thresholdY - 14;
      }
    }
  }

  // Active step value
  const inspectedIdx = hoverIdx !== null ? hoverIdx : currentStep;
  const inspectedPoint = points[inspectedIdx] || points[points.length - 1];
  const inspectedVal = inspectedPoint.val;

  const isAlert = threshold !== undefined && (
    thresholdDirection === 'above' ? inspectedVal >= threshold : inspectedVal <= threshold
  );

  return (
    <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-5 relative font-sans w-full min-w-0 shadow-sm dark:shadow-none transition-colors">
      {/* Header with Title, Reference Badges, and Live Value */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-[#B4E3C5]/60 dark:border-[#12612F]/40 pb-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#0E793C] dark:text-[#2FBF63] flex items-center space-x-1.5">
            <span className="text-[#0E793C] dark:text-[#4CFF8A]">◈</span>
            <span className="truncate">{title}</span>
          </span>

          {/* Reference Indicator Badges in Header */}
          {baseline !== undefined && (
            <span className="text-[10px] font-mono px-2 py-0.5 border border-[#0E793C]/40 dark:border-[#12612F] bg-[#EAF8EF] dark:bg-[#061C0E] text-[#0A602F] dark:text-[#4CFF8A] font-semibold">
              BASE: {baseline} {unit}
            </span>
          )}

          {threshold !== undefined && (
            <span className="text-[10px] font-mono px-2 py-0.5 border border-[#DC2626]/40 dark:border-[#FF2A1A]/40 bg-[#FEF2F2] dark:bg-[#200808] text-[#B91C1C] dark:text-[#FF6B6B] font-semibold">
              LIMIT: {threshold} {unit}
            </span>
          )}

          {isAlert && (
            <span className="text-[10px] tracking-widest text-[#B91C1C] dark:text-[#FF2A1A] border border-[#DC2626] dark:border-[#FF2A1A] bg-[#FEF2F2] dark:bg-[#FF2A1A]/10 px-2 py-0.5 uppercase font-bold shrink-0 animate-pulse">
              THRESHOLD EXCEEDED
            </span>
          )}
        </div>

        {/* Live Value & Quick Replay Button */}
        <div className="flex items-center space-x-3 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setIsLocalAnimating(true)}
            title="Replay this chart animation"
            className="text-[10px] font-mono border border-[#0E793C]/40 dark:border-[#12612F] bg-[#EAF8EF] dark:bg-[#061C0E] text-[#0A602F] dark:text-[#2FBF63] hover:text-[#0E793C] dark:hover:text-[#4CFF8A] px-2 py-1 transition-all cursor-pointer flex items-center space-x-1"
          >
            <span>↺</span>
            <span className="hidden sm:inline">ANIMATE</span>
          </button>

          <div className="text-right">
            <span className="text-[10px] font-mono text-[#4A755A] dark:text-[#2FBF63] mr-1.5 uppercase font-semibold">
              {inspectedPoint.label} :
            </span>
            <span className={`text-base sm:text-lg font-bold font-mono tabular-nums ${isAlert ? 'text-[#DC2626] dark:text-[#FF2A1A]' : 'text-[#0E2E1B] dark:text-[#B6FFCC]'}`}>
              {inspectedVal.toFixed(1)}
            </span>
            <span className="text-[11px] text-[#0E793C] dark:text-[#2FBF63] ml-1 font-semibold uppercase">{unit}</span>
          </div>
        </div>
      </div>

      {/* Main SVG Time-Series Display */}
      <div className="w-full overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto select-none overflow-visible"
          style={{ minHeight: '220px', maxHeight: '340px' }}
        >
          {/* Subtle Grid Guidelines */}
          <line x1={paddingLeft} y1={paddingTop} x2={width - 15} y2={paddingTop} stroke="currentColor" className="text-[#0E793C]/10 dark:text-[#2FBF63]/15" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingLeft} y1={paddingTop + plotHeight / 2} x2={width - 15} y2={paddingTop + plotHeight / 2} stroke="currentColor" className="text-[#0E793C]/10 dark:text-[#2FBF63]/15" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - 15} y2={height - paddingBottom} stroke="currentColor" className="text-[#0E793C]/25 dark:text-[#12612F]" strokeWidth="1.2" />

          {/* 1. Baseline Reference Line & Dedicated Non-Colliding Margin Badge */}
          {baselineY !== null && baselineBadgeY !== null && (
            <g className="chart-baseline-group">
              <line 
                x1={paddingLeft} 
                y1={baselineY} 
                x2={width - 15} 
                y2={baselineY} 
                stroke="currentColor"
                strokeWidth="1.5" 
                strokeDasharray="5 3" 
                className="text-[#0E793C] dark:text-[#2FBF63]"
              />
              {/* Leader connector if staggered */}
              {baselineBadgeY !== baselineY && (
                <line
                  x1={width - paddingRight + 8}
                  y1={baselineY}
                  x2={width - paddingRight + 16}
                  y2={baselineBadgeY}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-[#0E793C] dark:text-[#2FBF63]"
                />
              )}
              {/* Badge Background Rect (Dedicated Right Margin x = 865 to 1035) */}
              <rect
                x={width - paddingRight + 15}
                y={baselineBadgeY - 10}
                width="170"
                height="20"
                rx="3"
                fill="#EAF8EF"
                stroke="#0E793C"
                className="chart-badge-baseline-bg"
                strokeWidth="1.2"
              />
              {/* Badge Text */}
              <text 
                x={width - paddingRight + 22} 
                y={baselineBadgeY + 4} 
                fontSize="9.5" 
                fontWeight="700"
                fill="#0A602F"
                className="chart-badge-baseline-text uppercase tracking-wider font-mono select-none"
              >
                ● BASELINE ({baseline} {unit})
              </text>
            </g>
          )}

          {/* 2. Critical Limit Reference Line & Dedicated Non-Colliding Margin Badge */}
          {thresholdY !== null && thresholdBadgeY !== null && (
            <g className="chart-threshold-group">
              <line 
                x1={paddingLeft} 
                y1={thresholdY} 
                x2={width - 15} 
                y2={thresholdY} 
                stroke="currentColor"
                strokeWidth="1.5" 
                strokeDasharray="4 2" 
                className="text-[#DC2626] dark:text-[#FF2A1A]"
              />
              {/* Leader connector if staggered */}
              {thresholdBadgeY !== thresholdY && (
                <line
                  x1={width - paddingRight + 8}
                  y1={thresholdY}
                  x2={width - paddingRight + 16}
                  y2={thresholdBadgeY}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-[#DC2626] dark:text-[#FF2A1A]"
                />
              )}
              {/* Badge Background Rect (Dedicated Right Margin x = 865 to 1035) */}
              <rect
                x={width - paddingRight + 15}
                y={thresholdBadgeY - 10}
                width="170"
                height="20"
                rx="3"
                fill="#FEF2F2"
                stroke="#DC2626"
                className="chart-badge-threshold-bg"
                strokeWidth="1.2"
              />
              {/* Badge Text */}
              <text 
                x={width - paddingRight + 22} 
                y={thresholdBadgeY + 4} 
                fontSize="9.5" 
                fontWeight="700"
                fill="#B91C1C"
                className="chart-badge-threshold-text uppercase tracking-wider font-mono select-none"
              >
                ▲ CRITICAL ({threshold} {unit})
              </text>
            </g>
          )}

          {/* 3. Faint Future Guideline if Scrubbing */}
          {currentStep < points.length - 1 && (
            <path
              d={futurePathD}
              fill="none"
              stroke="currentColor"
              className="text-[#0E793C]/20 dark:text-[#4CFF8A]/20"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* 4. Active Telemetry Data Path */}
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isAlert ? 'text-[#DC2626] dark:text-[#FF2A1A]' : 'text-[#0E793C] dark:text-[#4CFF8A]'}
          />

          {/* 5. Active Vertical Cursor Scanline at Current / Hover Step */}
          {inspectedPoint && (
            <line
              x1={inspectedPoint.x}
              y1={paddingTop - 5}
              x2={inspectedPoint.x}
              y2={height - paddingBottom}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="2 2"
              className="text-[#0E793C] dark:text-[#4CFF8A] opacity-75"
            />
          )}

          {/* 6. Data Points (Circles) & X-Axis Day Labels */}
          {points.map((pt, idx) => {
            const isPointActive = idx <= currentStep;
            const isHovered = hoverIdx === idx || currentStep === idx;
            const ptExceeds = threshold !== undefined && (
              thresholdDirection === 'above' ? pt.val >= threshold : pt.val <= threshold
            );

            return (
              <g 
                key={idx} 
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onStepChange && onStepChange(idx)}
              >
                {/* Active pulsating beacon ring on current scrub point (Native SVG animation to prevent offset displacement) */}
                {currentStep === idx && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`${ptExceeds ? 'text-[#DC2626] dark:text-[#FF2A1A]' : 'text-[#0E793C] dark:text-[#4CFF8A]'} opacity-75`}
                  >
                    <animate
                      attributeName="r"
                      values="5;11;5"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.8;0.2;0.8"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Point Center Circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={`
                    ${isPointActive 
                      ? (ptExceeds ? 'text-[#DC2626] dark:text-[#FF2A1A]' : 'text-[#0E793C] dark:text-[#4CFF8A]')
                      : 'text-gray-300 dark:text-gray-700'
                    }
                    fill-white dark:fill-[#04130A] transition-all
                  `}
                />

                {/* Day label on X axis (D1, D2, ... D8) */}
                <text
                  x={pt.x}
                  y={height - paddingBottom + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  className={`font-mono uppercase transition-colors select-none ${
                    isHovered 
                      ? 'fill-[#0E793C] dark:fill-[#B6FFCC] font-extrabold' 
                      : (isPointActive ? 'fill-[#1C442D] dark:fill-[#75FFA5]' : 'fill-gray-400 dark:fill-gray-600')
                  }`}
                >
                  {pt.label}
                </text>

                {/* Sub-label Date below day */}
                {pt.date && (
                  <text
                    x={pt.x}
                    y={height - paddingBottom + 32}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="500"
                    className={`font-mono transition-colors select-none ${
                      isHovered ? 'fill-[#0A602F] dark:fill-[#4CFF8A]' : 'fill-[#4A755A] dark:fill-[#2FBF63]/70'
                    }`}
                  >
                    {pt.date}
                  </text>
                )}
              </g>
            );
          })}

          {/* 7. Hover Tooltip Box */}
          {hoverIdx !== null && (
            <g className="pointer-events-none transition-all">
              <rect
                x={Math.min(points[hoverIdx].x - 60, width - paddingRight - 100)}
                y={Math.max(points[hoverIdx].y - 42, paddingTop - 10)}
                width="120"
                height="32"
                rx="4"
                className="chart-tooltip-bg shadow-md"
                strokeWidth="1.5"
              />
              <text
                x={Math.min(points[hoverIdx].x - 60, width - paddingRight - 100) + 60}
                y={Math.max(points[hoverIdx].y - 42, paddingTop - 10) + 20}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                className="chart-tooltip-text font-mono"
              >
                {points[hoverIdx].val.toFixed(1)} {unit}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Sub-label footer with legend */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-[#0E793C] dark:text-[#2FBF63] tracking-wider uppercase mt-2 pt-2.5 border-t border-[#B4E3C5]/40 dark:border-[#12612F]/20">
        <span className="flex items-center space-x-3">
          <span>&lt; 7-DAY WEARABLE STREAM</span>
          <span className="hidden sm:inline text-gray-400 dark:text-gray-600">&bull;</span>
          <span className="hidden sm:inline">INTERVAL: 24H ACCUMULATOR</span>
        </span>
        <span className="font-semibold text-[#0A602F] dark:text-[#B6FFCC]">
          SIMULATION CLOCK: T+48H FORECAST WINDOW &gt;
        </span>
      </div>
    </div>
  );
}
