'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ScrambleTextProps {
  text: string;
  className?: string;
  as?: 'span' | 'div' | 'h2' | 'h3' | 'p';
  prefix?: React.ReactNode;
  duration?: number; // total duration of decode sweep in ms (default: 900)
  scrambleDelay?: number; // duration of pure scramble burst before decoding (default: 250)
  speed?: number; // interval between scramble frames in ms (default: 30)
  replayOnScroll?: boolean; // replay when scrolled back into view (default: true)
}

const GLYPHS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ_#&%*+~<>';

export default function ScrambleText({
  text,
  className = '',
  as = 'span',
  prefix,
  duration = 900,
  scrambleDelay = 250,
  speed = 30,
  replayOnScroll = true,
}: ScrambleTextProps) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [hasRevealed, setHasRevealed] = useState<boolean>(false);

  const getRandomGlyph = useCallback(() => {
    return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }, []);

  const generateScramble = useCallback(
    (source: string) => {
      return source.split('').map((char) => {
        if (char === ' ' || char === '—' || char === '·' || char === '•' || char === '[' || char === ']' || char === '/') {
          return char;
        }
        return getRandomGlyph();
      });
    },
    [getRandomGlyph]
  );

  const [scrambleChars, setScrambleChars] = useState<string[]>(() => text.split(''));

  const containerRef = useRef<HTMLElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const ambientIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef<boolean>(false);

  // Initialize mount and scrambled state on client
  useEffect(() => {
    setIsMounted(true);
    setScrambleChars(generateScramble(text));
    setRevealedCount(0);
  }, [text, generateScramble]);

  const startScramble = useCallback(() => {
    // Honor reduced-motion preference
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setRevealedCount(text.length);
      setIsAnimating(false);
      setHasRevealed(true);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);

    setIsAnimating(true);
    setRevealedCount(0);

    const startTime = Date.now();
    const length = text.length;

    // Immediately scramble all characters
    setScrambleChars(generateScramble(text));

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed < scrambleDelay) {
        // Phase 1: Pure scrambling across all characters
        setScrambleChars(generateScramble(text));
        setRevealedCount(0);
      } else {
        // Phase 2: Decoding sweep from left to right
        const decodeElapsed = elapsed - scrambleDelay;
        const progress = Math.min(decodeElapsed / duration, 1);
        const currentRevealed = Math.floor(progress * length);

        setRevealedCount(currentRevealed);

        setScrambleChars(() => {
          return text.split('').map((char, i) => {
            if (i < currentRevealed) {
              return char;
            }
            if (char === ' ' || char === '—' || char === '·' || char === '•' || char === '[' || char === ']' || char === '/') {
              return char;
            }
            return getRandomGlyph();
          });
        });

        if (progress >= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRevealedCount(length);
          setIsAnimating(false);
          setHasRevealed(true);
        }
      }
    }, speed);
  }, [text, duration, scrambleDelay, speed, generateScramble, getRandomGlyph]);

  // Ambient subtle flicker when waiting to be triggered
  useEffect(() => {
    if (!isMounted || hasRevealed || isAnimating) return;

    ambientIntervalRef.current = setInterval(() => {
      setScrambleChars((prev) => {
        return text.split('').map((char, i) => {
          if (char === ' ' || char === '—' || char === '·' || char === '•' || char === '[' || char === ']' || char === '/') {
            return char;
          }
          // 40% chance of glyph change for subtle ambient cyber flicker
          return Math.random() < 0.4 ? getRandomGlyph() : prev[i] || getRandomGlyph();
        });
      });
    }, 120);

    return () => {
      if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);
    };
  }, [isMounted, hasRevealed, isAnimating, text, getRandomGlyph]);

  // Scroll Trigger via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!hasTriggeredRef.current || replayOnScroll) {
              hasTriggeredRef.current = true;
              // Trigger with slight deliberate delay so user sees scramble before decipher
              setTimeout(() => {
                startScramble();
              }, 120);
            }
          } else if (replayOnScroll) {
            // When leaving viewport, reset to scrambled state so re-entry replays
            hasTriggeredRef.current = false;
            setHasRevealed(false);
            setRevealedCount(0);
            setScrambleChars(generateScramble(text));
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -15% 0px', // Trigger when well inside viewport reading area
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);
    };
  }, [startScramble, replayOnScroll, generateScramble, text]);

  // Hover to re-scramble anytime for tactile verification
  const handleMouseEnter = () => {
    if (!isAnimating) {
      startScramble();
    }
  };

  const Tag = as as React.ElementType;
  const isCustomFont = className.includes('font-sans') || className.includes('font-serif');
  const hasDisplayClass = className.includes('inline') || className.includes('flex') || className.includes('block');
  const displayClass = hasDisplayClass ? '' : as === 'span' ? 'inline-flex items-center' : 'block';
  const hasTrackingClass = className.includes('tracking-');

  return (
    <Tag
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      className={`${displayClass} select-none cursor-pointer ${isCustomFont ? '' : 'font-mono'} ${className}`}
      title="Hover or scroll to decipher"
    >
      {prefix && <span className="inline-block mr-2 shrink-0">{prefix}</span>}
      <span className={`tabular-nums ${hasTrackingClass ? '' : 'tracking-wider'} whitespace-pre-wrap break-words`}>
        {!isMounted
          ? text
          : text.split('').map((targetChar, i) => {
              const isResolved = hasRevealed || i < revealedCount;
              const isFrontier = i === revealedCount && isAnimating;
              const displayChar = isResolved ? targetChar : scrambleChars[i] || targetChar;

              if (targetChar === ' ') {
                return <span key={i}> </span>;
              }

              if (isFrontier) {
                return (
                  <span
                    key={i}
                    className="text-[#4CFF8A] font-bold drop-shadow-[0_0_10px_rgba(76,255,138,1)] bg-[#12612F]/40 px-[1px] animate-pulse"
                  >
                    {displayChar}
                  </span>
                );
              }

              if (!isResolved) {
                return (
                  <span key={i} className="text-[#2FBF63]/80 font-mono">
                    {displayChar}
                  </span>
                );
              }

              return (
                <span key={i} className="transition-colors duration-100">
                  {displayChar}
                </span>
              );
            })}
      </span>
    </Tag>
  );
}
