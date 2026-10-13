'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export interface LungMarker {
  id: string;
  name: string;
  shortLabel: string;
  x: number; // percentage from left
  y: number; // percentage from top
  status: 'HIGH' | 'ELEVATED' | 'CAUTION' | 'STABLE';
  value: string;
  baseline: string;
  description: string;
}

interface InteractiveThermalRevealProps {
  bodySrc?: string;
  lungsSrc?: string;
  className?: string;
  patientId?: string;
  onRegionHover?: (region: string | null) => void;
  onMarkerSelect?: (marker: LungMarker | null) => void;
}

export default function InteractiveThermalReveal({
  bodySrc = '/images/body.webp',
  lungsSrc = '/images/lungs.webp',
  className = '',
  patientId = 'PT-8821',
  onRegionHover,
  onMarkerSelect
}: InteractiveThermalRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fallback and state
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const [isLungsActive, setIsLungsActive] = useState<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [activeZone, setActiveZone] = useState<string>('PARIETAL THORAX');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Markers placed on the revealed lungs linked directly to product features
  const markers: LungMarker[] = [
    {
      id: 'inflammation',
      name: 'Airway Inflammation State I(t)',
      shortLabel: 'I(t) 0.84',
      x: 50,
      y: 38,
      status: 'HIGH',
      value: '0.84 / 1.0 (Critical)',
      baseline: 'Personal baseline: 0.28',
      description: 'Latent mucosal edema and smooth muscle constriction calculated from inhaled PM2.5 dose and controller adherence.'
    },
    {
      id: 'respiratory-rate',
      name: 'Resting Respiratory Rate Drift',
      shortLabel: 'RR +4.2/m',
      x: 33,
      y: 48,
      status: 'ELEVATED',
      value: '22.4 breaths/min',
      baseline: 'Personal baseline: 18.2 breaths/min',
      description: 'Early autonomic compensation detected during nocturnal rest, preceding patient-perceived shortness of breath by 36 hours.'
    },
    {
      id: 'spo2',
      name: 'Nocturnal SpO2 Nadir',
      shortLabel: 'SpO2 89.4%',
      x: 66,
      y: 60,
      status: 'HIGH',
      value: '89.4% Min Nadir',
      baseline: 'Normative target: ≥95.0%',
      description: 'Basilar airway micro-obstruction and ventilation-perfusion mismatch during sleep, recording 3 distinct nocturnal desaturations.'
    }
  ];

  // Animation and physics state
  const stateRef = useRef({
    targetMouse: { x: 0.5, y: 0.5 },
    currentMouse: { x: 0.5, y: 0.5 },
    targetRadius: 0.0,
    currentRadius: 0.0,
    targetFullReveal: 0.0,
    currentFullReveal: 0.0,
    baseRadiusPx: 140.0,
    isHovering: false,
    prefersReducedMotion: false,
    renderer: null as THREE.WebGLRenderer | null,
    material: null as THREE.ShaderMaterial | null,
    animationFrameId: 0,
    startTime: 0,
    isDestroyed: false
  });

  // Toggle SHOW LUNGS
  const toggleLungsReveal = () => {
    setIsLungsActive(prev => {
      const next = !prev;
      stateRef.current.targetFullReveal = next ? 1.0 : 0.0;
      return next;
    });
  };

  const handleMarkerClick = (marker: LungMarker, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextId = selectedMarkerId === marker.id ? null : marker.id;
    setSelectedMarkerId(nextId);
    if (onMarkerSelect) {
      onMarkerSelect(nextId ? marker : null);
    }
  };

  // Anatomical zone detection
  const updateAnatomicalZone = useCallback((uvX: number, uvY: number) => {
    const screenX = uvX * 100;
    const screenY = (1.0 - uvY) * 100;

    let zone = 'PERIPHERAL THORACIC SHELL';
    if (screenY < 25) {
      zone = 'SUPRASTERNAL NOTCH / TRACHEA';
    } else if (screenY >= 25 && screenY <= 45 && screenX >= 40 && screenX <= 60) {
      zone = 'CARINA & MAINSTEM BRONCHIAL TREE';
    } else if (screenY >= 35 && screenY <= 72 && screenX >= 18 && screenX <= 48) {
      zone = 'RIGHT PULMONARY LOBE';
    } else if (screenY >= 35 && screenY <= 72 && screenX >= 52 && screenX <= 82) {
      zone = 'LEFT PULMONARY LOBE';
    } else if (screenY > 72) {
      zone = 'DIAPHRAGMATIC BASAL RECESS';
    }

    setActiveZone(zone);
    if (onRegionHover) {
      onRegionHover(zone);
    }
  }, [onRegionHover]);

  // Pointer event listeners
  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height) || 400;
    const uvX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const uvY = Math.max(0, Math.min(1, 1.0 - (e.clientY - rect.top) / rect.height));

    stateRef.current.isHovering = true;
    stateRef.current.targetMouse.x = uvX;
    stateRef.current.targetMouse.y = uvY;
    stateRef.current.currentMouse.x = uvX;
    stateRef.current.currentMouse.y = uvY;
    stateRef.current.targetRadius = stateRef.current.baseRadiusPx / minDim;

    setIsHovering(true);
    updateAnatomicalZone(uvX, uvY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height) || 400;
    const uvX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const uvY = Math.max(0, Math.min(1, 1.0 - (e.clientY - rect.top) / rect.height));

    stateRef.current.targetMouse.x = uvX;
    stateRef.current.targetMouse.y = uvY;
    stateRef.current.targetRadius = stateRef.current.baseRadiusPx / minDim;

    updateAnatomicalZone(uvX, uvY);
  };

  const onPointerLeave = () => {
    stateRef.current.isHovering = false;
    stateRef.current.targetRadius = 0.0;
    setIsHovering(false);
    setActiveZone('STANDBY (SCANNER DISENGAGED)');
    if (onRegionHover) {
      onRegionHover(null);
    }
  };

  // Main WebGL Setup
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Detect reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    stateRef.current.prefersReducedMotion = mediaQuery.matches;
    const motionListener = (e: MediaQueryListEvent) => {
      stateRef.current.prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener('change', motionListener);

    // Initialize Three.js WebGL renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      stateRef.current.renderer = renderer;
    } catch {
      console.warn('WebGL initialization failed, using CSS mask fallback.');
      setWebglSupported(false);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Load textures
    const textureLoader = new THREE.TextureLoader();
    const bodyTexture = textureLoader.load(bodySrc, () => {
      bodyTexture.colorSpace = THREE.SRGBColorSpace;
      bodyTexture.minFilter = THREE.LinearFilter;
      bodyTexture.magFilter = THREE.LinearFilter;
      bodyTexture.wrapS = THREE.ClampToEdgeWrapping;
      bodyTexture.wrapT = THREE.ClampToEdgeWrapping;
    }, undefined, () => {
      setWebglSupported(false);
    });

    const lungsTexture = textureLoader.load(lungsSrc, () => {
      lungsTexture.colorSpace = THREE.SRGBColorSpace;
      lungsTexture.minFilter = THREE.LinearFilter;
      lungsTexture.magFilter = THREE.LinearFilter;
      lungsTexture.wrapS = THREE.ClampToEdgeWrapping;
      lungsTexture.wrapT = THREE.ClampToEdgeWrapping;
    }, undefined, () => {
      setWebglSupported(false);
    });

    // Custom GLSL Shader Material
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uBody;
      uniform sampler2D uLungs;
      uniform vec2 uMouse;
      uniform float uRadius;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uFullReveal;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec4 bodyColor = texture2D(uBody, vUv);
        vec4 lungColor = texture2D(uLungs, vUv);

        // Aspect ratio correction for circular reveal
        float aspect = uResolution.x / uResolution.y;
        vec2 aspectUv = vec2(vUv.x * aspect, vUv.y);
        vec2 aspectMouse = vec2(uMouse.x * aspect, uMouse.y);

        float dist = distance(aspectUv, aspectMouse);

        // Subtle organic boundary modulation
        vec2 dir = aspectUv - aspectMouse;
        float angle = atan(dir.y, dir.x);
        float n = noise(vec2(angle * 4.0, uTime * 1.2)) * 0.6 + noise(vec2(angle * 9.0 - uTime * 2.0, uTime * 0.5)) * 0.4;

        float effectiveRadius = uRadius * (1.0 + (n - 0.5) * 0.09);
        float edgeFeather = max(0.012, uRadius * 0.26);

        float circleMask = 0.0;
        if (uRadius > 0.001) {
          circleMask = 1.0 - smoothstep(effectiveRadius - edgeFeather, effectiveRadius, dist);
        }

        float revealFactor = clamp(max(circleMask, uFullReveal), 0.0, 1.0);
        vec3 finalColor = mix(bodyColor.rgb, lungColor.rgb, revealFactor);

        // Phosphor rim halo at the scanning perimeter
        if (uRadius > 0.005 && circleMask > 0.01 && circleMask < 0.98) {
          float rim = smoothstep(0.0, 0.5, circleMask) * (1.0 - smoothstep(0.5, 1.0, circleMask)) * 4.0;
          vec3 phosphorGlow = vec3(0.25, 0.95, 0.52);
          finalColor += rim * phosphorGlow * 0.32 * clamp(uRadius * 6.0, 0.0, 1.0);
        }

        // Faint scanlines
        float scanline = sin(vUv.y * uResolution.y * 1.5) * 0.02;
        finalColor -= scanline;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBody: { value: bodyTexture },
        uLungs: { value: lungsTexture },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(container.clientWidth || 520, container.clientHeight || 690) },
        uTime: { value: 0.0 },
        uFullReveal: { value: 0.0 }
      },
      depthWrite: false,
      depthTest: false
    });
    stateRef.current.material = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const updateSize = () => {
      if (!container || !renderer || !material) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        renderer.setSize(width, height, false);
        material.uniforms.uResolution.value.set(width, height);
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    // Animation Loop
    stateRef.current.isDestroyed = false;
    stateRef.current.startTime = performance.now();

    const render = () => {
      if (stateRef.current.isDestroyed) return;

      const state = stateRef.current;
      const elapsedTime = (performance.now() - state.startTime) / 1000;

      const isReduced = state.prefersReducedMotion;
      const lerpMouse = isReduced ? 1.0 : 0.16;
      const lerpRadius = isReduced ? 1.0 : 0.12;
      const lerpReveal = isReduced ? 1.0 : 0.10;

      state.currentMouse.x += (state.targetMouse.x - state.currentMouse.x) * lerpMouse;
      state.currentMouse.y += (state.targetMouse.y - state.currentMouse.y) * lerpMouse;
      state.currentRadius += (state.targetRadius - state.currentRadius) * lerpRadius;
      state.currentFullReveal += (state.targetFullReveal - state.currentFullReveal) * lerpReveal;

      if (state.currentRadius < 0.0005) state.currentRadius = 0.0;
      if (state.currentFullReveal < 0.0005) state.currentFullReveal = 0.0;

      if (material) {
        material.uniforms.uMouse.value.set(state.currentMouse.x, state.currentMouse.y);
        material.uniforms.uRadius.value = state.currentRadius;
        material.uniforms.uFullReveal.value = state.currentFullReveal;
        if (!isReduced) {
          material.uniforms.uTime.value = elapsedTime;
        }
      }

      renderer.render(scene, camera);
      state.animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };

    const handleContextRestored = () => {
      updateSize();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      stateRef.current.isDestroyed = true;
      cancelAnimationFrame(stateRef.current.animationFrameId);
      mediaQuery.removeEventListener('change', motionListener);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      geometry.dispose();
      material.dispose();
      bodyTexture.dispose();
      lungsTexture.dispose();
      renderer.dispose();
    };
  }, [bodySrc, lungsSrc]);

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      {/* Visualizer Frame */}
      <div
        ref={containerRef}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => setSelectedMarkerId(null)}
        className="relative w-full max-w-[480px] aspect-[3/4] bg-[#020A05] border border-[#12612F] overflow-hidden cursor-crosshair group touch-none"
        role="region"
        aria-label="Interactive Coronal Thermal Torso Scan with Pulmonary Reveal"
      >
        {/* WebGL Canvas or Fallback */}
        {webglSupported ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />
        ) : (
          <div className="relative w-full h-full">
            <img
              src={bodySrc}
              alt="Base thermal scan of human torso"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <img
              src={lungsSrc}
              alt="Revealed internal pulmonary heatmap"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isLungsActive ? 'opacity-100' : isHovering ? 'opacity-85' : 'opacity-0'
              }`}
            />
          </div>
        )}

        {/* Small corner tags */}
        <div className="absolute top-2.5 left-2.5 pointer-events-none flex items-center space-x-1.5 z-10">
          <span className="text-[10px] font-mono tracking-wider text-[#4CFF8A] uppercase bg-[#020A05]/85 px-1.5 py-0.5 border border-[#12612F]">
            {`// CORONAL TRANSECT • ${patientId}`}
          </span>
        </div>

        <div className="absolute top-2.5 right-2.5 pointer-events-none z-10">
          <span className="text-[10px] font-mono tracking-wider text-[#B6FFCC] uppercase bg-[#020A05]/85 px-1.5 py-0.5 border border-[#12612F]">
            {isLungsActive ? 'EXPOSED' : isHovering ? 'ACTIVE SCAN' : 'STANDBY'}
          </span>
        </div>

        {/* Clickable Anatomical Hotspot Markers on the Revealed Lungs */}
        {markers.map((marker) => {
          const isSelected = selectedMarkerId === marker.id;
          const statusBorder =
            marker.status === 'HIGH' ? 'border-[#FF2A1A] text-[#FF2A1A]' :
            marker.status === 'ELEVATED' ? 'border-[#FFA61F] text-[#FFA61F]' :
            'border-[#FFE14A] text-[#FFE14A]';

          return (
            <div
              key={marker.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto"
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            >
              <button
                type="button"
                onClick={(e) => handleMarkerClick(marker, e)}
                aria-expanded={isSelected}
                aria-label={`Inspect ${marker.name}: ${marker.value}`}
                className={`group/marker relative flex items-center justify-center p-1 focus:outline-none cursor-pointer transition-transform ${
                  isSelected ? 'scale-110' : 'hover:scale-105'
                }`}
              >
                {/* Visual marker pin */}
                <span
                  className={`w-3.5 h-3.5 border bg-[#020A05]/95 flex items-center justify-center ${statusBorder} ${
                    isSelected ? 'ring-2 ring-[#B6FFCC]' : ''
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 inline-block ${
                      marker.status === 'HIGH' ? 'bg-[#FF2A1A]' :
                      marker.status === 'ELEVATED' ? 'bg-[#FFA61F]' : 'bg-[#FFE14A]'
                    }`}
                  />
                </span>

                {/* Always visible or hover badge */}
                <span className="absolute left-5 top-1/2 -translate-y-1/2 bg-[#020A05] border border-[#12612F] text-[9px] font-mono uppercase tracking-wider text-[#B6FFCC] px-1 py-0.5 whitespace-nowrap hidden group-hover/marker:block pointer-events-none shadow-sm">
                  {marker.shortLabel}
                </span>
              </button>

              {/* Clickable Tooltip Card */}
              {isSelected && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-6 top-1/2 -translate-y-1/2 w-64 bg-[#04130A] border border-[#4CFF8A] p-2.5 text-xs font-mono z-40 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-[#12612F] pb-1 mb-1.5">
                    <span className="text-[10px] text-[#2FBF63] uppercase tracking-wider">
                      {`// HOTSPOT TELEMETRY`}
                    </span>
                    <button
                      onClick={() => setSelectedMarkerId(null)}
                      className="text-[#2FBF63] hover:text-[#FF2A1A] text-xs font-bold px-1"
                      aria-label="Close tooltip"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="font-semibold text-[#B6FFCC] text-[11px] uppercase mb-1">
                    {marker.name}
                  </div>
                  <div className="text-[12px] font-bold text-[#FF2A1A] mb-0.5">
                    {marker.value}
                  </div>
                  <div className="text-[10px] text-[#2FBF63] mb-1.5">
                    {marker.baseline}
                  </div>
                  <p className="text-[10px] text-[#4CFF8A] leading-relaxed border-t border-[#12612F]/40 pt-1">
                    {marker.description}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Caption & Show Lungs Toggle Strip */}
      <div className="w-full max-w-[480px] mt-2.5 flex items-center justify-between px-1 text-xs font-mono">
        <div className="text-[11px] text-[#2FBF63] flex items-center space-x-1.5">
          <span className="text-[#4CFF8A]">&gt;</span>
          <span>Hover to look inside · tap markers to inspect</span>
        </div>

        {/* Accessible SHOW LUNGS toggle */}
        <button
          onClick={toggleLungsReveal}
          aria-pressed={isLungsActive}
          aria-label="Toggle full pulmonary lung reveal"
          className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border cursor-pointer transition-colors ${
            isLungsActive
              ? 'bg-[#FF2A1A] text-[#020A05] border-[#FF2A1A]'
              : 'bg-[#04130A] text-[#4CFF8A] border-[#12612F] hover:border-[#4CFF8A]'
          }`}
        >
          {isLungsActive ? 'HIDE LUNGS' : 'SHOW LUNGS'}
        </button>
      </div>
    </div>
  );
}
