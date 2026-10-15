'use client';

import React, { useRef, useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

interface NavLinkItem {
  label: string;
  href: string;
}

const NAV_LINKS: NavLinkItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Patients', href: '/patients' },
  { label: 'Benchmarks & Assumptions', href: '/benchmarks' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [, startTransition] = useTransition();

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
    const match = NAV_LINKS.slice(1).find((link) => currentPath.startsWith(link.href));
    return match ? match.href : '/';
  };

  const activeHref = getActiveHref(pathname);

  // Recalculate active underline position immediately on mount or route change
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
    }
  }, [pathname, activeHref]);

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

  // Instant hover tracking with zero delay
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

  // Instant click feedback: immediately slide active underline without waiting for route navigation
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
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
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo & Wordmark */}
        <Link
          href="/"
          aria-label="BreathTwin home"
          className="flex items-center space-x-3 group cursor-pointer"
        >
          <span className="w-8 h-8 border border-[#4CFF8A] bg-[#04130A] flex items-center justify-center font-mono font-bold text-sm text-white group-hover:bg-[#4CFF8A] group-hover:text-[#020A05] transition-colors duration-150 shadow-[0_0_8px_rgba(76,255,138,0.25)]">
            BT
          </span>
          <span className="hidden sm:block font-bold tracking-wide text-white text-base">
            BreathTwin
          </span>
        </Link>

        {/* Center: Vercel-style Tab Navigation */}
        <nav className="hidden md:block h-full" aria-label="Main Navigation">
          <ul
            ref={listRef}
            onMouseLeave={handleListMouseLeave}
            className="relative flex items-center h-full space-x-1"
          >
            {/* 1. Cursor Following Hover Box: Soft, Rounded, Snappy Tracking */}
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

            {/* 2. Active Tab Underline: Sits Flush on Bottom Border Line */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 h-[2px] bg-white pointer-events-none transition-[left,width,opacity] duration-150 ease-out shadow-[0_0_8px_rgba(255,255,255,0.7)]"
              style={{
                left: activeRect.left,
                width: activeRect.width,
                opacity: activeRect.opacity,
              }}
            />

            {/* Nav Tabs */}
            {NAV_LINKS.map((link) => {
              const isActive = activeHref === link.href;

              return (
                <li key={link.href} className="h-full flex items-center">
                  <Link
                    href={link.href}
                    data-nav-href={link.href}
                    onMouseEnter={handleLinkMouseEnter}
                    onClick={(e) => handleLinkClick(e, link.href)}
                    className={`relative z-10 px-4 py-2 text-sm font-medium transition-colors duration-100 cursor-pointer ${
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

        {/* Right: Theme Toggle, CTA Button & Mobile Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <ThemeToggle />

          <Link
            href="/patients"
            className="hidden sm:flex h-9 px-4 text-xs sm:text-sm font-semibold border border-[#4CFF8A] bg-[#4CFF8A] text-white dark:text-[#020A05] hover:bg-transparent hover:text-white transition-all duration-150 items-center justify-center shadow-[0_0_10px_rgba(76,255,138,0.25)]"
          >
            Open dashboard
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
            <span className="text-xs uppercase font-mono text-[#2FBF63]">MODE:</span>
            <ThemeToggle />
          </div>
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => {
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
          </ul>

          <div className="pt-2 border-t border-[#12612F]/40">
            <Link
              href="/patients"
              onClick={() => setMenuOpen(false)}
              className="flex h-10 items-center justify-center border border-[#4CFF8A] bg-[#4CFF8A] text-white dark:text-[#020A05] font-bold text-xs uppercase tracking-wider"
            >
              Open dashboard
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
