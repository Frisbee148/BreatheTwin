'use client';

import React from 'react';
import { RiskLevel } from '@/lib/data';

interface StatusChipProps {
  status:
    | RiskLevel
    | 'NORMAL'
    | 'CAUTION'
    | 'ELEVATED'
    | 'HIGH RISK'
    | 'ONLINE'
    | 'ACTIVE ALERT'
    | 'Normal'
    | 'Watch'
    | 'Alert'
    | 'normal'
    | 'watch'
    | 'alert'
    | string;
  size?: 'sm' | 'md';
}

export default function StatusChip({ status, size = 'md' }: StatusChipProps) {
  let borderColor = 'border-[#4CFF8A]';
  let textColor = 'text-[#4CFF8A]';
  let glowClass = 'glow-text';
  const labelText = status;
  const upper = String(status).toUpperCase();

  if (upper === 'HIGH RISK' || upper === 'ACTIVE ALERT' || upper === 'ALERT') {
    borderColor = 'border-[#FF2A1A]';
    textColor = 'text-[#FF2A1A]';
    glowClass = 'glow-danger';
  } else if (upper === 'ELEVATED') {
    borderColor = 'border-[#FFA61F]';
    textColor = 'text-[#FFA61F]';
    glowClass = 'glow-warn';
  } else if (upper === 'CAUTION' || upper === 'WATCH') {
    borderColor = 'border-[#FFE14A]';
    textColor = 'text-[#FFE14A]';
    glowClass = 'glow-caution';
  } else {
    // NORMAL / ONLINE
    borderColor = 'border-[#4CFF8A]';
    textColor = 'text-[#4CFF8A]';
    glowClass = 'glow-text';
  }

  const sizeClasses = size === 'sm' 
    ? 'text-[10px] px-2 py-0.5 tracking-wider' 
    : 'text-[12px] px-2.5 py-1 tracking-widest';

  return (
    <span
      className={`inline-flex items-center justify-center font-medium uppercase border ${borderColor} ${textColor} ${glowClass} ${sizeClasses} bg-[#04130A] select-none`}
      style={{ borderRadius: 0 }}
    >
      <span className="w-1.5 h-1.5 mr-1.5 inline-block" style={{ backgroundColor: 'currentColor' }} />
      {labelText}
    </span>
  );
}
