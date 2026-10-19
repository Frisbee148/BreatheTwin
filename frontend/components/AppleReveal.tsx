'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AppleRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number; // Delay in ms before reveal starts (for staggered cascades)
  duration?: number; // Duration of the reveal transition in ms (default: 1000ms for Apple-style slow reveal)
  distance?: number; // Y translation distance in px (default: 36px)
  threshold?: number; // Intersection threshold (default: 0.12)
  rootMargin?: string;
  once?: boolean; // Reveal once and stay visible (default: true)
  as?: 'div' | 'span' | 'section' | 'article' | 'h1' | 'h2' | 'h3' | 'p';
}

/**
 * AppleReveal component
 * Implements Apple's signature slow reveal effect:
 * - Silky smooth cubic-bezier(0.16, 1, 0.3, 1) ease-out
 * - Subtle slide-up + progressive opacity fade
 * - Staggerable via `delay` prop for cascading cards and grids
 * - Graceful degradation for SSR and reduced motion
 */
export default function AppleReveal({
  children,
  className = '',
  delay = 0,
  duration = 1000,
  distance = 36,
  threshold = 0.12,
  rootMargin = '0px 0px -40px 0px',
  once = true,
  as: Component = 'div',
}: AppleRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Respect user's motion preferences
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsVisible(true);
      return;
    }

    const node = elementRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) {
            observer.unobserve(entry.target);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, once]);

  return (
    <Component
      ref={elementRef as any}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translate3d(0, 0, 0)'
          : `translate3d(0, ${distance}px, 0)`,
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: isVisible ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </Component>
  );
}
