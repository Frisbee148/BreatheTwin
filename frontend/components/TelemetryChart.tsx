'use client';

import React, { useState } from 'react';
import { TelemetryPoint } from '@/lib/data';

interface TelemetryChartProps {
  title: string;
  data: TelemetryPoint[];
  dataKey: keyof TelemetryPoint;
  baseline?: number;
  threshold?: number;
  thresholdDirection?: 'above' | 'below'; // warning when above or below
  unit: string;
  color?: string;
  minVal?: number;
  maxVal?: number;
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
  maxVal
}: TelemetryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const rawValues = data.map(d => Number(d[dataKey]));
  const computedMin = minVal !== undefined ? minVal : Math.floor(Math.min(...rawValues, baseline ?? Infinity, threshold ?? Infinity) * 0.95);
  const computedMax = maxVal !== undefined ? maxVal : Math.ceil(Math.max(...rawValues, baseline ?? -Infinity, threshold ?? -Infinity) * 1.05);
  const range = computedMax - computedMin || 1;

  const width = 600;
  const height = 190;
  const paddingX = 40;
  const paddingY = 28;

  const getX = (idx: number) => paddingX + (idx / (data.length - 1)) * (width - 2 * paddingX);
  const getY = (val: number) => height - paddingY - ((val - computedMin) / range) * (height - 2 * paddingY);

  const points = data.map((d, idx) => ({
    x: getX(idx),
    y: getY(Number(d[dataKey])),
    val: Number(d[dataKey]),
    label: d.dayShort,
    date: d.date,
    day: d.day
  }));

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const baselineY = baseline !== undefined ? getY(baseline) : null;
  const thresholdY = threshold !== undefined ? getY(threshold) : null;

  const latestVal = points[points.length - 1].val;
  const isAlert = threshold !== undefined && (
    thresholdDirection === 'above' ? latestVal >= threshold : latestVal <= threshold
  );

  return (
    <div className="border border-[#12612F] bg-[#04130A] p-4 relative font-sans w-full min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 border-b border-[#12612F]/40 pb-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63] flex items-center space-x-1.5">
            <span className="text-[#4CFF8A]">◈</span>
            <span className="truncate">{title}</span>
          </span>
          {isAlert && (
            <span className="text-[10px] tracking-widest text-[#FF2A1A] border border-[#FF2A1A] px-1.5 py-0.5 uppercase font-bold shrink-0">
              THRESHOLD EXCEEDED
            </span>
          )}
        </div>
        <div className="text-right shrink-0 ml-auto">
          <span className={`text-sm md:text-base font-semibold tabular-nums ${isAlert ? 'text-[#FF2A1A]' : 'text-[#B6FFCC]'}`}>
            {latestVal.toFixed(1)}
          </span>
          <span className="text-[11px] text-[#2FBF63] ml-1 uppercase">{unit}</span>
        </div>
      </div>

      {/* SVG Time Series */}
      <div className="w-full overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto select-none"
          style={{ maxHeight: '210px' }}
        >
          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#12612F" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#12612F" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#12612F" strokeWidth="1" />

          {/* Baseline reference line */}
          {baselineY !== null && (
            <g>
              <line 
                x1={paddingX} 
                y1={baselineY} 
                x2={width - paddingX} 
                y2={baselineY} 
                stroke="#2FBF63" 
                strokeWidth="1.2" 
                strokeDasharray="4 2" 
              />
              <rect
                x={width - paddingX - 146}
                y={baselineY <= paddingY + 14 ? baselineY + 2 : baselineY - 14}
                width="144"
                height="13"
                fill="#04130A"
                fillOpacity="0.85"
                rx="2"
              />
              <text 
                x={width - paddingX - 4} 
                y={baselineY <= paddingY + 14 ? baselineY + 12 : baselineY - 4} 
                fill="#2FBF63" 
                fontSize="9" 
                textAnchor="end" 
                className="uppercase tracking-widest font-mono"
              >
                BASELINE ({baseline} {unit})
              </text>
            </g>
          )}

          {/* Threshold reference line */}
          {thresholdY !== null && (
            <g>
              <line 
                x1={paddingX} 
                y1={thresholdY} 
                x2={width - paddingX} 
                y2={thresholdY} 
                stroke="#FF2A1A" 
                strokeWidth="1.2" 
                strokeDasharray="2 2" 
              />
              <rect
                x={paddingX + 2}
                y={thresholdY <= paddingY + 14 ? thresholdY + 2 : thresholdY - 14}
                width="158"
                height="13"
                fill="#04130A"
                fillOpacity="0.85"
                rx="2"
              />
              <text 
                x={paddingX + 4} 
                y={thresholdY <= paddingY + 14 ? thresholdY + 12 : thresholdY - 4} 
                fill="#FF2A1A" 
                fontSize="9" 
                textAnchor="start" 
                className="uppercase tracking-widest font-mono font-bold"
              >
                CRITICAL LIMIT ({threshold} {unit})
              </text>
            </g>
          )}

          {/* Main Signal Path */}
          <path
            d={pathD}
            fill="none"
            stroke={isAlert ? '#FF2A1A' : color}
            strokeWidth="1.8"
            strokeLinecap="square"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {points.map((pt, idx) => {
            const isHovered = hoverIdx === idx;
            const ptExceeds = threshold !== undefined && (
              thresholdDirection === 'above' ? pt.val >= threshold : pt.val <= threshold
            );
            const ptColor = ptExceeds ? '#FF2A1A' : color;

            return (
              <g 
                key={idx} 
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 5 : 3}
                  fill="#04130A"
                  stroke={ptColor}
                  strokeWidth="2"
                />
                {/* Day label on X axis */}
                <text
                  x={pt.x}
                  y={height - 6}
                  fill={isHovered ? '#B6FFCC' : '#2FBF63'}
                  fontSize="10"
                  textAnchor="middle"
                  className="font-mono tracking-wider uppercase"
                >
                  {pt.label}
                </text>
              </g>
            );
          })}

          {/* Hover Tooltip Box */}
          {hoverIdx !== null && (
            <g>
              <line
                x1={points[hoverIdx].x}
                y1={paddingY}
                x2={points[hoverIdx].x}
                y2={height - paddingY}
                stroke="#4CFF8A"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <rect
                x={Math.min(points[hoverIdx].x - 45, width - 100)}
                y={Math.max(points[hoverIdx].y - 38, 4)}
                width="90"
                height="28"
                fill="#020A05"
                stroke="#12612F"
                strokeWidth="1"
              />
              <text
                x={Math.min(points[hoverIdx].x - 45, width - 100) + 45}
                y={Math.max(points[hoverIdx].y - 38, 4) + 18}
                fill="#B6FFCC"
                fontSize="11"
                textAnchor="middle"
                className="font-mono font-semibold"
              >
                {points[hoverIdx].val.toFixed(1)} {unit}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Sub-label indicators */}
      <div className="flex items-center justify-between text-[10px] text-[#2FBF63] tracking-wider uppercase mt-2 pt-2 border-t border-[#12612F]/20">
        <span>&lt; 7-DAY WEARABLE REPLAY</span>
        <span>CURRENT CLOCK: T+48H &gt;</span>
      </div>
    </div>
  );
}
