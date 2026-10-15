'use client';

import React, { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Light mode is default unless explicitly set to 'dark'
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark') {
        setThemeState('dark');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        setThemeState('light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch {
      setThemeState('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const changeTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch {}

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    window.dispatchEvent(new Event('theme-change'));
  };

  if (!mounted) {
    return (
      <div className="w-16 sm:w-28 h-9 border border-[#12612F] bg-[#04130A] opacity-40" />
    );
  }

  return (
    <div className="flex items-center border border-[#12612F] bg-[#04130A] p-0.5 text-xs font-mono select-none">
      <button
        type="button"
        onClick={() => changeTheme('light')}
        aria-label="Switch to Light Mode"
        className={`px-2 py-1 flex items-center space-x-1 transition-all cursor-pointer ${
          theme === 'light'
            ? 'theme-toggle-light-active font-semibold'
            : 'text-[#2FBF63] hover:text-[#4CFF8A]'
        }`}
      >
        <svg className="w-3.5 h-3.5 inline-block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" strokeWidth="2" />
          <path strokeWidth="2" strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <span className="hidden sm:inline text-[10px] uppercase tracking-wider">LIGHT</span>
      </button>

      <button
        type="button"
        onClick={() => changeTheme('dark')}
        aria-label="Switch to Dark Mode"
        className={`px-2 py-1 flex items-center space-x-1 transition-all cursor-pointer ${
          theme === 'dark'
            ? 'theme-toggle-dark-active font-bold'
            : 'text-[#2FBF63] hover:text-[#4CFF8A]'
        }`}
      >
        <svg className="w-3.5 h-3.5 inline-block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
        <span className="hidden sm:inline text-[10px] uppercase tracking-wider">DARK</span>
      </button>
    </div>
  );
}
