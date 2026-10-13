'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

interface InteractiveThermalRevealProps {
  bodySrc?: string;
  lungsSrc?: string;
  className?: string;
  patientId?: string;
  onRegionHover?: (region: string | null) => void;
}

export default function InteractiveThermalReveal({
  bodySrc = '/images/body.webp',
  lungsSrc = '/images/lungs.webp',
  className = '',
  patientId = 'PT-8821',
  onRegionHover
}: InteractiveThermalRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fallback state if WebGL is unavailable
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const [isLungsActive, setIsLungsActive] = useState<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [scannerRadiusPreset, setScannerRadiusPreset] = useState<'normal' | 'wide' | 'pinpoint'>('normal');
  const [activeZone, setActiveZone] = useState<string>('PARIETAL THORAX');
  const [hudCoordinates, setHudCoordinates] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

  // References for animation loop and uniforms
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
    isDestroyed: false,
    isIdle: true
  });

  // Handle radius preset change
  const handlePresetChange = (preset: 'normal' | 'wide' | 'pinpoint') => {
    setScannerRadiusPreset(preset);
    const px = preset === 'pinpoint' ? 95 : preset === 'wide' ? 210 : 140;
    stateRef.current.baseRadiusPx = px;
    if (stateRef.current.isHovering && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const minDim = Math.min(rect.width, rect.height) || 400;
      stateRef.current.targetRadius = px / minDim;
    }
  };

  // Toggle SHOW LUNGS
  const toggleLungsReveal = () => {
    setIsLungsActive(prev => {
      const next = !prev;
      stateRef.current.targetFullReveal = next ? 1.0 : 0.0;
      return next;
    });
  };

  // Anatomical zone detection based on UV coordinates
  const updateAnatomicalZone = useCallback((uvX: number, uvY: number) => {
    // uvX: 0 to 1 (left to right)
    // uvY: 0 (bottom) to 1 (top)
    // Converted to screen percent (top-down):
    const screenX = uvX * 100;
    const screenY = (1.0 - uvY) * 100;

    setHudCoordinates({ x: Math.round(screenX), y: Math.round(screenY) });

    let zone = 'PERIPHERAL THORACIC SHELL';
    if (screenY < 25) {
      zone = 'SUPRASTERNAL NOTCH / CERVICAL TRACHEA';
    } else if (screenY >= 25 && screenY <= 45 && screenX >= 42 && screenX <= 58) {
      zone = 'CARINA & MAINSTEM BRONCHIAL TREE';
    } else if (screenY >= 35 && screenY <= 72 && screenX >= 20 && screenX <= 48) {
      zone = 'RIGHT PULMONARY LOBE (SUPERIOR / MIDDLE)';
    } else if (screenY >= 35 && screenY <= 72 && screenX >= 52 && screenX <= 80) {
      zone = 'LEFT PULMONARY LOBE (SUPERIOR / INFERIOR)';
    } else if (screenY > 72) {
      zone = 'DIAPHRAGMATIC SULCUS & BASAL RECESS';
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
      console.warn('WebGL not supported, falling back to CSS implementation.');
      setWebglSupported(false);
      return;
    }

    // Set up 2D Orthographic Scene
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

      // Pseudo-random hash
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Smooth 2D noise
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

        // Subtle organic noise perturbation on the boundary
        vec2 dir = aspectUv - aspectMouse;
        float angle = atan(dir.y, dir.x);
        float n = noise(vec2(angle * 4.0, uTime * 1.2)) * 0.6 + noise(vec2(angle * 9.0 - uTime * 2.0, uTime * 0.5)) * 0.4;

        // Effective radius with slight organic edge distortion
        float effectiveRadius = uRadius * (1.0 + (n - 0.5) * 0.09);
        float edgeFeather = max(0.012, uRadius * 0.26);

        // Soft feathered circular mask (1.0 inside, 0.0 outside)
        float circleMask = 0.0;
        if (uRadius > 0.001) {
          circleMask = 1.0 - smoothstep(effectiveRadius - edgeFeather, effectiveRadius, dist);
        }

        // Combine with uFullReveal (from SHOW LUNGS toggle)
        float revealFactor = clamp(max(circleMask, uFullReveal), 0.0, 1.0);

        // Blend base body and revealed lungs
        vec3 finalColor = mix(bodyColor.rgb, lungColor.rgb, revealFactor);

        // Thermal scan boundary glow (narrow phosphor green halo along the scanner edge)
        if (uRadius > 0.005 && circleMask > 0.01 && circleMask < 0.98) {
          float rim = smoothstep(0.0, 0.5, circleMask) * (1.0 - smoothstep(0.5, 1.0, circleMask)) * 4.0;
          vec3 phosphorGlow = vec3(0.28, 1.0, 0.58);
          finalColor += rim * phosphorGlow * 0.38 * clamp(uRadius * 6.0, 0.0, 1.0);
        }

        // Subtle horizontal scan lines for military thermal-imaging aesthetic
        float scanline = sin(vUv.y * uResolution.y * 1.5) * 0.022;
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
        uResolution: { value: new THREE.Vector2(container.clientWidth || 600, container.clientHeight || 800) },
        uTime: { value: 0.0 },
        uFullReveal: { value: 0.0 }
      },
      depthWrite: false,
      depthTest: false
    });
    stateRef.current.material = material;

    // Full screen rendering plane
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Resize handler
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

      // Smooth interpolation physics (damped spring / lerp)
      const isReduced = state.prefersReducedMotion;
      const lerpMouse = isReduced ? 1.0 : 0.16;
      const lerpRadius = isReduced ? 1.0 : 0.12;
      const lerpReveal = isReduced ? 1.0 : 0.10;

      state.currentMouse.x += (state.targetMouse.x - state.currentMouse.x) * lerpMouse;
      state.currentMouse.y += (state.targetMouse.y - state.currentMouse.y) * lerpMouse;
      state.currentRadius += (state.targetRadius - state.currentRadius) * lerpRadius;
      state.currentFullReveal += (state.targetFullReveal - state.currentFullReveal) * lerpReveal;

      // Clamp small tail values to zero
      if (state.currentRadius < 0.0005) state.currentRadius = 0.0;
      if (state.currentFullReveal < 0.0005) state.currentFullReveal = 0.0;

      // Update shader uniforms
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

    // Context loss handling
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost, pausing render.');
    };

    const handleContextRestored = () => {
      console.info('WebGL context restored, re-initializing.');
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
      {/* Visualizer Frame with Military Cybernetic Borders */}
      <div
        ref={containerRef}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="relative w-full max-w-[540px] aspect-[3/4] bg-[#020A05] border border-[#12612F] shadow-[0_0_40px_rgba(4,25,12,0.8)] overflow-hidden cursor-crosshair group touch-none"
        role="region"
        aria-label="Interactive Coronal Thermal Torso Scan with Pulmonary Reveal"
      >
        {/* WebGL Canvas */}
        {webglSupported ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />
        ) : (
          /* CSS-based fallback for environments where WebGL is unavailable */
          <div className="relative w-full h-full">
            {/* Base Body Image */}
            <img
              src={bodySrc}
              alt="Base thermal scan of human torso"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Revealed Lungs Image with CSS Mask or Opacity */}
            <img
              src={lungsSrc}
              alt="Revealed internal pulmonary heatmap"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                isLungsActive ? 'opacity-100' : isHovering ? 'opacity-80' : 'opacity-0'
              }`}
            />
          </div>
        )}

        {/* HUD Overlay: Corner Precision Reticles */}
        <div className="absolute top-2 left-2 pointer-events-none flex items-center space-x-1.5 z-10">
          <span className="w-2 h-2 border-t-2 border-l-2 border-[#4CFF8A]" />
          <span className="text-[10px] font-mono tracking-widest text-[#4CFF8A] uppercase bg-[#020A05]/80 px-1.5 py-0.5 border border-[#12612F]/60">
            {`// TRANSECT: CORONAL • ${patientId}`}
          </span>
        </div>

        <div className="absolute top-2 right-2 pointer-events-none flex items-center space-x-1.5 z-10">
          <span className="text-[10px] font-mono tracking-widest text-[#B6FFCC] uppercase bg-[#020A05]/80 px-1.5 py-0.5 border border-[#12612F]/60">
            {isLungsActive ? 'ANATOMY: EXPOSED' : isHovering ? 'SCANNER: SCANNING' : 'OPTICAL EMISSION'}
          </span>
          <span className="w-2 h-2 border-t-2 border-r-2 border-[#4CFF8A]" />
        </div>

        <div className="absolute bottom-2 left-2 pointer-events-none flex items-center space-x-1.5 z-10">
          <span className="w-2 h-2 border-b-2 border-l-2 border-[#4CFF8A]" />
          <span className="text-[9px] font-mono tracking-widest text-[#2FBF63] uppercase bg-[#020A05]/85 px-1.5 py-0.5 border border-[#12612F]/50">
            X:{hudCoordinates.x}% Y:{hudCoordinates.y}%
          </span>
        </div>

        <div className="absolute bottom-2 right-2 pointer-events-none flex items-center space-x-1.5 z-10">
          <span className="text-[9px] font-mono tracking-widest text-[#4CFF8A] uppercase bg-[#020A05]/85 px-1.5 py-0.5 border border-[#12612F]/50">
            {isHovering ? '&gt; HOVER ACTIVE' : '&gt; HOVER TO SCAN'}
          </span>
          <span className="w-2 h-2 border-b-2 border-r-2 border-[#4CFF8A]" />
        </div>

        {/* Anatomical Inspection Crosshair Center Pointer (Visible when hovering) */}
        {isHovering && !isLungsActive && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-20 transition-transform duration-75 ease-out"
            style={{ left: `${hudCoordinates.x}%`, top: `${hudCoordinates.y}%` }}
          >
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div className="absolute inset-0 border border-[#4CFF8A]/30 rounded-full animate-ping" />
              <div className="w-2 h-2 border-t border-l border-[#B6FFCC]" />
              <div className="w-2 h-2 border-b border-r border-[#B6FFCC]" />
            </div>
          </div>
        )}
      </div>

      {/* Control Console & Accessibility Strip */}
      <div className="w-full max-w-[540px] mt-3 border border-[#12612F] bg-[#04130A] p-3 text-xs font-mono space-y-2.5">
        {/* Main Status & Accessibility Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12612F]/40 pb-2">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full inline-block transition-colors ${
                isLungsActive || isHovering ? 'bg-[#FF2A1A] animate-pulse shadow-[0_0_8px_#FF2A1A]' : 'bg-[#2FBF63]'
              }`}
            />
            <span className="text-[11px] font-semibold text-[#B6FFCC] uppercase tracking-wider">
              {activeZone}
            </span>
          </div>

          {/* Accessible SHOW LUNGS toggle button (Requirement 7) */}
          <button
            onClick={toggleLungsReveal}
            aria-pressed={isLungsActive}
            aria-label="Toggle full pulmonary lung thermal view"
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border cursor-pointer transition-all ${
              isLungsActive
                ? 'bg-[#FF2A1A] text-[#020A05] border-[#FF2A1A] shadow-[0_0_12px_rgba(255,42,26,0.6)]'
                : 'bg-[#061C0E] text-[#4CFF8A] border-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05]'
            }`}
          >
            {isLungsActive ? 'HIDE LUNGS [ACTIVE]' : 'SHOW LUNGS'}
          </button>
        </div>

        {/* Diagnostics & Scan Aperture Selector */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-[#2FBF63] pt-0.5">
          <div className="flex items-center space-x-2">
            <span className="uppercase tracking-widest text-[#2FBF63]">SCAN BEAM:</span>
            <div className="inline-flex border border-[#12612F] bg-[#020A05]">
              <button
                onClick={() => handlePresetChange('pinpoint')}
                className={`px-2 py-0.5 cursor-pointer uppercase transition-colors ${
                  scannerRadiusPreset === 'pinpoint' ? 'bg-[#12612F] text-[#B6FFCC]' : 'hover:text-[#4CFF8A]'
                }`}
              >
                95PX
              </button>
              <button
                onClick={() => handlePresetChange('normal')}
                className={`px-2 py-0.5 cursor-pointer uppercase border-x border-[#12612F] transition-colors ${
                  scannerRadiusPreset === 'normal' ? 'bg-[#12612F] text-[#B6FFCC]' : 'hover:text-[#4CFF8A]'
                }`}
              >
                140PX
              </button>
              <button
                onClick={() => handlePresetChange('wide')}
                className={`px-2 py-0.5 cursor-pointer uppercase transition-colors ${
                  scannerRadiusPreset === 'wide' ? 'bg-[#12612F] text-[#B6FFCC]' : 'hover:text-[#4CFF8A]'
                }`}
              >
                210PX
              </button>
            </div>
          </div>

          <div className="text-[10px] text-[#4CFF8A] font-mono">
            TOUCH / HOVER TO REVEAL INFLAMMATION
          </div>
        </div>
      </div>
    </div>
  );
}
