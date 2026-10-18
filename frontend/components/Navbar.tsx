'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '@/lib/auth';

interface NavLinkItem {
  label: string;
  href: string;
}

const DOCTOR_NAV_LINKS: NavLinkItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Patients', href: '/patients' },
  { label: 'Patient Portal', href: '/patient-portal' },
  { label: 'Benchmarks & Assumptions', href: '/benchmarks' },
];

const PATIENT_NAV_LINKS: NavLinkItem[] = [
  { label: 'Home', href: '/' },
  { label: 'My Health Today', href: '/patient-portal' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { session, switchRoleQuick } = useAuth();

  const navLinks = session.role === 'patient' ? PATIENT_NAV_LINKS : DOCTOR_NAV_LINKS;

  const listRef = useRef<HTMLUListElement>(null);
  const [activeRect, setActiveRect] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [hoverRect, setHoverRect] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  // Determine active route link
  const getActiveHref = (currentPath: string) => {
    if (currentPath === '/') return '/';
    if (currentPath.startsWith('/assumptions')) return '/benchmarks';
    if (currentPath.startsWith('/patient-preview')) return '/patient-portal';
    const match = navLinks.slice(1).find((link) => currentPath.startsWith(link.href));
    return match ? match.href : '/';
  };

  const activeHref = getActiveHref(pathname);

  // Recalculate active underline position immediately on mount or route/role change
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const activeEl = list.querySelector(`[data-nav-href="${activeHref}"]`) as HTMLElement;
    if (activeEl) {
      setActiveRect({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        opacity: 1,
      });
    } else {
      setActiveRect((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [pathname, activeHref, session.role]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      const list = listRef.current;
      if (!list) return;
      const activeEl = list.querySelector(`[data-nav-href="${activeHref}"]`) as HTMLElement;
      if (activeEl) {
        setActiveRect({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
          opacity: 1,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeHref]);

  const handleLinkMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = e.currentTarget;
    setHoverRect({
      left: target.offsetLeft,
      width: target.offsetWidth,
      opacity: 1,
    });
  };

  const handleListMouseLeave = () => {
    setHoverRect((prev) => ({
      ...prev,
      opacity: 0,
    }));
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = e.currentTarget;
    setActiveRect({
      left: target.offsetLeft,
      width: target.offsetWidth,
      opacity: 1,
    });
    setHoverRect((prev) => ({
      ...prev,
      opacity: 0,
    }));
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#12612F] bg-[#020A05]/95 backdrop-blur-md">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo & Wordmark */}
        <Link
          href="/"
          aria-label="BreathTwin home"
          className="flex items-center space-x-3 group cursor-pointer"
        >
          <span className="w-8 h-8 border border-[#4CFF8A] bg-[#04130A] flex items-center justify-center font-mono font-bold text-sm text-white group-hover:bg-[#4CFF8A] group-hover:text-[#020A05] transition-colors duration-150 shadow-[0_0_8px_rgba(76,255,138,0.25)]">
            BT
          </span>
          <div className="hidden sm:flex flex-col">
            <span className="font-bold tracking-wide text-white text-base leading-none">
              BreathTwin
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#2FBF63] mt-0.5">
              {session.role === 'doctor' ? 'CLINICIAN MODE' : `PATIENT • ${session.patientId || 'PT-8821'}`}
            </span>
          </div>
        </Link>

        {/* Center: Tab Navigation */}
        <nav className="hidden md:block h-full" aria-label="Main Navigation">
          <ul
            ref={listRef}
            onMouseLeave={handleListMouseLeave}
            className="relative flex items-center h-full space-x-1"
          >
            <div
              aria-hidden="true"
              className="absolute h-9 rounded-md bg-[#0B3519]/75 border border-[#166E34]/50 pointer-events-none transition-[left,width,opacity] duration-150 ease-out"
              style={{
                left: hoverRect.left,
                width: hoverRect.width,
                opacity: hoverRect.opacity,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />

            <div
              aria-hidden="true"
              className="absolute bottom-0 h-[2px] bg-white pointer-events-none transition-[left,width,opacity] duration-150 ease-out shadow-[0_0_8px_rgba(255,255,255,0.7)]"
              style={{
                left: activeRect.left,
                width: activeRect.width,
                opacity: activeRect.opacity,
              }}
            />

            {navLinks.map((link) => {
              const isActive = activeHref === link.href;

              return (
                <li key={link.href} className="h-full flex items-center">
                  <Link
                    href={link.href}
                    data-nav-href={link.href}
                    onMouseEnter={handleLinkMouseEnter}
                    onClick={handleLinkClick}
                    className={`relative z-10 px-3.5 py-2 text-sm font-medium transition-colors duration-100 cursor-pointer ${
                      isActive ? 'text-white font-semibold' : 'text-[#75FFA5] hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right: Dual-Interface Role Switcher, Login Link, Theme Toggle & CTA */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          {/* Quick Dual-Role Toggle Pill */}
          <div
            className="hidden lg:flex items-center border border-[#12612F] bg-[#04130A] p-0.5 text-[11px] font-mono"
            role="group"
            aria-label="Interface role selector"
          >
            <button
              type="button"
              onClick={() => switchRoleQuick('doctor')}
              className={`px-2.5 py-1 uppercase font-bold transition-colors cursor-pointer ${
                session.role === 'doctor'
                  ? 'bg-[#4CFF8A] text-[#020A05]'
                  : 'text-[#2FBF63] hover:text-white'
              }`}
              title="Switch to Treating Doctor Interface (Full Cohort & Clinical Detail)"
            >
              Doctor
            </button>
            <button
              type="button"
              onClick={() => switchRoleQuick('patient')}
              className={`px-2.5 py-1 uppercase font-bold transition-colors cursor-pointer ${
                session.role === 'patient'
                  ? 'bg-[#4CFF8A] text-[#020A05]'
                  : 'text-[#2FBF63] hover:text-white'
              }`}
              title="Switch to Patient Personal Interface (Plain-Language Status & Care Plan)"
            >
              Patient
            </button>
          </div>

          <Link
            href="/login"
            className="hidden sm:flex h-9 px-3 text-xs font-mono uppercase tracking-wider font-semibold border border-[#12612F] bg-[#04130A] text-[#4CFF8A] hover:border-[#4CFF8A] hover:text-white transition-colors items-center justify-center"
            title={`Logged in as ${session.name} (${session.role.toUpperCase()}). Click to switch account.`}
          >
            {session.role === 'doctor' ? 'DR. LOGIN' : `${session.patientId} LOGIN`}
          </Link>

          <ThemeToggle />

          <Link
            href={session.role === 'patient' ? '/patient-portal' : '/patients'}
            className="hidden sm:flex h-9 px-4 text-xs sm:text-sm font-semibold border border-[#4CFF8A] bg-[#4CFF8A] text-white dark:text-[#020A05] hover:bg-transparent hover:text-white transition-all duration-150 items-center justify-center shadow-[0_0_10px_rgba(76,255,138,0.25)]"
          >
            {session.role === 'patient' ? 'My Health Today' : 'Open dashboard'}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            className="md:hidden w-10 h-10 border border-[#12612F] text-white flex items-center justify-center cursor-pointer hover:border-[#4CFF8A] transition-colors duration-150"
          >
            <span className="flex flex-col space-y-1.5">
              <span className={`block w-4 h-px bg-current transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-4 h-px bg-current transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-4 h-px bg-current transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden border-t border-[#12612F] bg-[#020A05] px-4 py-3 space-y-3"
        >
          <div className="pb-2 border-b border-[#12612F]/40 flex items-center justify-between">
            <span className="text-xs uppercase font-mono text-[#2FBF63]">
              ROLE: {session.role.toUpperCase()} ({session.name})
            </span>
            <ThemeToggle />
          </div>

          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-[#12612F]/40 font-mono text-xs">
            <button
              type="button"
              onClick={() => {
                switchRoleQuick('doctor');
                setMenuOpen(false);
              }}
              className={`py-2 border uppercase font-bold ${
                session.role === 'doctor'
                  ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                  : 'border-[#12612F] text-[#2FBF63]'
              }`}
            >
              Doctor View
            </button>
            <button
              type="button"
              onClick={() => {
                switchRoleQuick('patient');
                setMenuOpen(false);
              }}
              className={`py-2 border uppercase font-bold ${
                session.role === 'patient'
                  ? 'border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05]'
                  : 'border-[#12612F] text-[#2FBF63]'
              }`}
            >
              Patient View
            </button>
          </div>

          <ul className="space-y-1">
            {navLinks.map((link) => {
              const isActive = activeHref === link.href;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block py-2.5 px-3 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#0B3519]/80 text-white border-l-2 border-[#4CFF8A]'
                        : 'text-[#75FFA5] hover:text-white hover:bg-[#062413]'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 px-3 rounded-md text-sm font-mono font-medium text-[#4CFF8A] hover:text-white"
              >
                Switch Account / Login &rarr;
              </Link>
            </li>
          </ul>

          <div className="pt-2 border-t border-[#12612F]/40">
            <Link
              href={session.role === 'patient' ? '/patient-portal' : '/patients'}
              onClick={() => setMenuOpen(false)}
              className="flex h-10 items-center justify-center border border-[#4CFF8A] bg-[#4CFF8A] text-white dark:text-[#020A05] font-bold text-xs uppercase tracking-wider"
            >
              {session.role === 'patient' ? 'Open My Health Portal' : 'Open Doctor Dashboard'}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
