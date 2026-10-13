'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PATIENTS } from '@/lib/data';

export default function Navbar() {
  const pathname = usePathname();
  const activeAlertCount = PATIENTS.filter(p => p.activeAlert).length;

  const navLinks = [
    { label: '[01] OVERVIEW', href: '/' },
    { label: '[02] PATIENT COHORT', href: '/patients' },
    { label: '[03] MODEL BENCHMARKS', href: '/benchmarks' },
    { label: '[04] PHYSIOLOGY ASSUMPTIONS', href: '/assumptions' },
    { label: '[05] PATIENT PREVIEW', href: '/patient-preview' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#020A05] border-b border-[#12612F]">
      {/* Top Clinical Utility Strip */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between text-[11px] font-medium tracking-[0.08em] uppercase border-b border-[#12612F]/40 text-[#2FBF63]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-[#4CFF8A]">
            <span className="w-2 h-2 mr-2 bg-[#4CFF8A] animate-pulse inline-block" />
            &gt; TWIN REPLAY CLOCK: <span className="text-[#B6FFCC] ml-1 font-mono">T+48H LIVE</span>
          </span>
          <span className="hidden md:inline text-[#12612F]">|</span>
          <span className="hidden md:inline">
            ENV STREAM: <span className="text-[#B6FFCC]">CPCB + OPENAQ IND (DELHI/MUMBAI)</span>
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <Link 
            href="/patients"
            className="flex items-center text-[#FF2A1A] hover:underline"
          >
            <span className="w-1.5 h-1.5 bg-[#FF2A1A] mr-1.5 inline-block" />
            ALERTS: <span className="font-mono font-bold ml-1">{activeAlertCount} HIGH-RISK DETECTED</span>
          </Link>
          <span className="text-[#12612F]">|</span>
          <span className="text-[#FFE14A] border border-[#FFE14A]/40 px-2 py-0.5 text-[10px]">
            PROTOTYPE // NOT MEDICAL ADVICE
          </span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-7 h-7 border border-[#4CFF8A] bg-[#04130A] flex items-center justify-center font-mono font-bold text-[#4CFF8A] group-hover:bg-[#4CFF8A] group-hover:text-[#020A05] transition-colors">
            BT
          </div>
          <div>
            <div className="font-semibold tracking-wider text-sm sm:text-base text-[#B6FFCC] glow-text">
              BREATHTWIN
            </div>
            <div className="text-[10px] tracking-[0.1em] text-[#2FBF63] uppercase -mt-0.5">{`// ASTHMA DIGITAL TWIN CORE`}</div>
          </div>
        </Link>

        {/* Desktop Links */}
        <nav className="hidden lg:flex items-center space-x-6 text-[12px] font-medium tracking-[0.08em] uppercase">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`py-2 transition-colors relative ${
                  active
                    ? 'text-[#B6FFCC] font-semibold underline underline-offset-8 decoration-2 decoration-[#4CFF8A]'
                    : 'text-[#2FBF63] hover:text-[#4CFF8A]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Button */}
        <div className="flex items-center space-x-3">
          <Link
            href="/patients"
            className="h-9 px-4 text-xs tracking-wider uppercase font-medium border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors flex items-center justify-center"
          >
            PATIENT TRIAGE &gt;
          </Link>
        </div>
      </div>

      {/* Mobile Links Row */}
      <div className="lg:hidden border-t border-[#12612F]/60 overflow-x-auto py-2 px-4 flex items-center space-x-4 text-[11px] tracking-[0.08em] uppercase scrollbar-none">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap ${
                active ? 'text-[#B6FFCC] underline font-bold' : 'text-[#2FBF63]'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
