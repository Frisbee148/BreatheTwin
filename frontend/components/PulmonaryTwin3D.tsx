'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Patient } from '@/lib/data';

// Cached GLTF scene to prevent re-fetching the 7.6MB model when switching patients
let cachedGLTFScene: THREE.Group | null = null;
let gltfLoadingPromise: Promise<THREE.Group> | null = null;

function loadGLTFModel(url: string): Promise<THREE.Group> {
  if (cachedGLTFScene) {
    return Promise.resolve(cachedGLTFScene.clone(true));
  }
  if (gltfLoadingPromise) {
    return gltfLoadingPromise.then((scene) => scene.clone(true));
  }

  gltfLoadingPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        cachedGLTFScene = gltf.scene;
        resolve(gltf.scene.clone(true));
      },
      undefined,
      (err) => {
        console.error('Failed to load 3D lung model:', err);
        reject(err);
      }
    );
  });

  return gltfLoadingPromise.then((scene) => scene.clone(true));
}

export interface HotspotPin {
  id: string;
  name: string;
  localPos: THREE.Vector3;
  status: 'NORMAL' | 'CAUTION' | 'ELEVATED' | 'HIGH RISK';
  description: string;
}

interface PulmonaryTwin3DProps {
  patient: Patient;
  selectedRegion: string;
  onSelectRegion: (regionId: string) => void;
  className?: string;
}

export default function PulmonaryTwin3D({
  patient,
  selectedRegion,
  onSelectRegion,
  className = '',
}: PulmonaryTwin3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [breathingEnabled, setBreathingEnabled] = useState<boolean>(true);
  const [respirationPhase, setRespirationPhase] = useState<'INSPIRATION' | 'EXPIRATION'>('INSPIRATION');

  // Screen projected coordinates for 3D hotspot pins
  const [pinScreens, setPinScreens] = useState<Record<string, { x: number; y: number; visible: boolean }>>({});

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Hotspots positioned anatomically on the normalized lung coordinate space
  const hotspots: HotspotPin[] = [
    {
      id: 'airway-tree',
      name: 'Mainstem Tracheobronchial Junction',
      localPos: new THREE.Vector3(0.0, 0.025, 0.02),
      status: patient.riskLevel,
      description: 'Carina & primary bronchial bifurcation. Primary impaction zone for ambient PM2.5 particles.',
    },
    {
      id: 'right-lobe',
      name: 'Right Upper Lobar Segment',
      localPos: new THREE.Vector3(-0.065, 0.015, 0.035),
      status: patient.riskLevel === 'HIGH RISK' ? 'ELEVATED' : 'NORMAL',
      description: 'Right apical-posterior segment. Early ventilation-perfusion mismatch locus.',
    },
    {
      id: 'left-lower',
      name: 'Left Lower Basilar Airway',
      localPos: new THREE.Vector3(0.068, -0.095, 0.03),
      status:
        patient.riskLevel === 'HIGH RISK'
          ? 'HIGH RISK'
          : patient.riskLevel === 'ELEVATED'
          ? 'CAUTION'
          : 'NORMAL',
      description: 'Dependent basilar zone during nocturnal supine posture. Correlated with nocturnal SpO2 dips.',
    },
  ];

  // Detect and listen to theme changes
  useEffect(() => {
    const checkTheme = () => {
      const root = document.documentElement;
      const isDarkMode = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';
      setIsDark(isDarkMode);
    };

    checkTheme();

    const handleThemeEvent = () => checkTheme();
    window.addEventListener('theme-change', handleThemeEvent);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          checkTheme();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('theme-change', handleThemeEvent);
      observer.disconnect();
    };
  }, []);

  // Helper to ensure full studio lighting is always active on the scene
  const applyLighting = (targetScene: THREE.Scene, darkMode: boolean) => {
    // Remove existing lights to prevent stacking
    const lights = targetScene.getObjectsByProperty('isLight', true);
    lights.forEach((l) => targetScene.remove(l));

    if (darkMode) {
      // Clean, bright anatomical illumination for dark theme
      const ambientLight = new THREE.AmbientLight(0xffffff, 2.4);
      targetScene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
      keyLight.position.set(1.2, 1.8, 1.8);
      targetScene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xa7f3d0, 2.0);
      fillLight.position.set(-1.4, 0.6, 1.2);
      targetScene.add(fillLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 1.8);
      backLight.position.set(0, 1.2, -1.8);
      targetScene.add(backLight);

      const rimLight = new THREE.DirectionalLight(0x4cff8a, 1.0);
      rimLight.position.set(0, -0.8, -1.0);
      targetScene.add(rimLight);
    } else {
      // Bright studio clinical lighting for light theme
      const ambientLight = new THREE.AmbientLight(0xffffff, 2.6);
      targetScene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
      keyLight.position.set(1.2, 1.8, 1.8);
      targetScene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xe2e8f0, 2.2);
      fillLight.position.set(-1.4, 0.6, 1.2);
      targetScene.add(fillLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 1.8);
      backLight.position.set(0, 1.2, -1.8);
      targetScene.add(backLight);

      const rimLight = new THREE.DirectionalLight(0x10b981, 0.9);
      rimLight.position.set(0, -0.8, -1.0);
      targetScene.add(rimLight);
    }
  };

  // Update Three.js lighting and scene background on theme change
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;

    const scene = sceneRef.current;
    const renderer = rendererRef.current;

    if (isDark) {
      scene.background = new THREE.Color(0x020a05);
      renderer.setClearColor(0x020a05, 1.0);
    } else {
      scene.background = new THREE.Color(0xf4f8f5);
      renderer.setClearColor(0xf4f8f5, 1.0);
    }

    applyLighting(scene, isDark);
  }, [isDark]);

  // Main Three.js Scene Setup & Animation Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 450;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const initialBg = isDark ? 0x020a05 : 0xf4f8f5;
    scene.background = new THREE.Color(initialBg);

    // Apply lighting immediately upon scene creation so model is never black
    applyLighting(scene, isDark);

    // 2. Camera - locked in coronal viewing position
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 10);
    camera.position.set(0, 0.02, 0.62);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    rendererRef.current = renderer;

    // Attach canvas
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls - LOCKED IN PLACE (cannot be moved by cursor)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Root group for model, rotation & breathing oscillations
    const rootModelGroup = new THREE.Group();
    modelGroupRef.current = rootModelGroup;
    scene.add(rootModelGroup);

    // Subtle coordinate plane reference grid
    const gridHelper = new THREE.GridHelper(0.8, 16, 0x12612f, isDark ? 0x062312 : 0xc8e2cf);
    gridHelper.position.y = -0.22;
    scene.add(gridHelper);

    // 5. Load and center the ORIGINAL GLB Model (preserving original materials and textures)
    setLoading(true);
    setLoadError(null);

    loadGLTFModel('/models/realistic_human_lungs.glb')
      .then((clonedScene) => {
        // Calculate bounding box and center origin
        const box = new THREE.Box3().setFromObject(clonedScene);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Center model directly at (0, 0, 0)
        clonedScene.position.sub(center);

        // Preserve all original embedded textures and PBR materials with proper light response
        clonedScene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.material) {
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((mat) => {
                mat.side = THREE.DoubleSide;
                mat.needsUpdate = true;
                if ('roughness' in mat && typeof (mat as any).roughness === 'number') {
                  (mat as any).roughness = Math.min((mat as any).roughness, 0.65);
                }
                if ('metalness' in mat && typeof (mat as any).metalness === 'number') {
                  (mat as any).metalness = Math.min((mat as any).metalness, 0.15);
                }
              });
            }
          }
        });

        rootModelGroup.add(clonedScene);
        setLoading(false);
      })
      .catch((err) => {
        console.error('PulmonaryTwin3D load error:', err);
        setLoadError('Failed to load 3D anatomical model');
        setLoading(false);
      });

    // 6. Animation: Fixed Slow Continuous Rotation & Respiration Cycle Loop
    let lastTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      const currentTime = performance.now();
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      const elapsed = (currentTime - startTime) / 1000;

      // Fixed slow continuous rotation (steady 0.25 rad/sec, completely immune to cursor movements)
      if (rootModelGroup) {
        rootModelGroup.rotation.y += delta * 0.25;
      }

      // Physiological Breathing Oscillation
      const rr = patient.currentTelemetry?.rr || patient.baselineRR || 16;
      const omega = (rr / 60) * 2 * Math.PI;

      if (breathingEnabled && rootModelGroup) {
        const sinVal = Math.sin(elapsed * omega);
        const cosVal = Math.cos(elapsed * omega);

        // Lateral + Anteroposterior rib cage expansion
        const scaleX = 1.0 + sinVal * 0.045;
        const scaleY = 1.0 + sinVal * 0.015;
        const scaleZ = 1.0 + sinVal * 0.035;
        rootModelGroup.scale.set(scaleX, scaleY, scaleZ);

        // Respiration phase telemetry
        setRespirationPhase(cosVal > 0 ? 'INSPIRATION' : 'EXPIRATION');
      }

      // Render
      renderer.render(scene, camera);

      // Project 3D Hotspot Coordinates to 2D Container Screen Coordinates in real-time
      if (rootModelGroup) {
        const newScreens: Record<string, { x: number; y: number; visible: boolean }> = {};
        hotspots.forEach((hs) => {
          // Calculate world position
          const worldPos = hs.localPos.clone().applyMatrix4(rootModelGroup.matrixWorld);
          const projected = worldPos.clone().project(camera);

          // Convert to pixel coordinates inside the container
          const px = (projected.x * 0.5 + 0.5) * width;
          const py = (-(projected.y * 0.5) + 0.5) * height;

          // Check if facing the camera (z in NDC is < 1.0)
          const isFacingFront = projected.z < 1.0;
          newScreens[hs.id] = {
            x: Math.round(px),
            y: Math.round(py),
            visible: isFacingFront && px >= 0 && px <= width && py >= 0 && py <= height,
          };
        });
        setPinScreens(newScreens);
      }
    };

    animate();

    // 7. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      width = container.clientWidth || 600;
      height = container.clientHeight || 450;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    // Cleanup on unmount
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [patient, isDark, breathingEnabled]);

  // Focus a specific hotspot without moving locked camera
  const handleSelectHotspot = (hotspotId: string) => {
    onSelectRegion(hotspotId);
  };

  const rrValue = patient.currentTelemetry?.rr || patient.baselineRR || 16;

  // Dynamic Theme Styling Tokens for HUD
  const hudBgClass = isDark
    ? 'bg-[#020A05]/85 border-[#12612F] text-[#B6FFCC]'
    : 'bg-[#FFFFFF]/90 border-[#C8E2CF] text-[#0E2E1B] shadow-sm';

  const badgeHeaderClass = isDark ? 'text-[#2FBF63]' : 'text-[#236B3D]';

  return (
    <div
      className={`relative w-full aspect-[4/3] min-h-[380px] sm:min-h-[460px] overflow-hidden border ${
        isDark ? 'border-[#12612F] bg-[#020A05]' : 'border-[#C8E2CF] bg-[#F4F8F5]'
      } select-none ${className}`}
    >
      {/* 3D WebGL Canvas Container - LOCKED (cursor cannot move model) */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-default" />

      {/* Loading Overlay */}
      {loading && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center ${
            isDark ? 'bg-[#020A05]/90' : 'bg-[#F4F8F5]/90'
          } z-30`}
        >
          <div className="w-10 h-10 border-2 border-[#12612F] border-t-[#4CFF8A] rounded-full animate-spin mb-3" />
          <div
            className={`text-xs font-mono uppercase tracking-widest ${
              isDark ? 'text-[#4CFF8A]' : 'text-[#0E793C]'
            }`}
          >
            SYNCHRONIZING ORIGINAL PULMONARY 3D MESH...
          </div>
          <div className={`text-[10px] font-mono mt-1 ${isDark ? 'text-[#2FBF63]' : 'text-[#236B3D]'}`}>
            PARSING ANATOMICAL LUNG MORPHOLOGY ({patient.id})
          </div>
        </div>
      )}

      {/* Error Fallback */}
      {loadError && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center ${
            isDark ? 'bg-[#020A05]/95' : 'bg-[#FFFFFF]/95'
          } z-30 p-6 text-center`}
        >
          <div className="text-red-500 font-mono text-sm mb-2">{loadError}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-[#0E793C] text-white text-xs font-mono hover:bg-[#12612F]"
          >
            RETRY INITIALIZATION
          </button>
        </div>
      )}

      {/* Top HUD Bar: View Mode & Respiration Telemetry */}
      <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
        {/* Left Telemetry Stamp */}
        <div
          className={`pointer-events-auto backdrop-blur-sm border px-2.5 py-1 text-[10px] font-mono flex items-center space-x-3 ${hudBgClass}`}
        >
          <span className={`${badgeHeaderClass} uppercase tracking-widest font-semibold`}>
            {`3D TWIN: ${patient.id}`}
          </span>
          <span className="opacity-30">|</span>
          <span>
            RR:{' '}
            <strong
              className={
                rrValue >= 18
                  ? 'text-[#DC2626]'
                  : isDark
                  ? 'text-[#4CFF8A]'
                  : 'text-[#0E793C]'
              }
            >
              {rrValue.toFixed(1)}
            </strong>{' '}
            bpm
          </span>
          <span className="opacity-30">|</span>
          <span className="flex items-center space-x-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                respirationPhase === 'INSPIRATION'
                  ? isDark
                    ? 'bg-[#4CFF8A] animate-ping'
                    : 'bg-[#0E793C] animate-ping'
                  : isDark
                  ? 'bg-[#2FBF63]'
                  : 'bg-[#236B3D]'
              }`}
            />
            <span className={`text-[9px] ${isDark ? 'text-[#4CFF8A]' : 'text-[#0E793C]'}`}>
              {respirationPhase}
            </span>
          </span>
        </div>

        {/* Right: Model Status Badge */}
        <div
          className={`pointer-events-auto flex items-center border backdrop-blur-sm px-2.5 py-1 text-[10px] font-mono ${hudBgClass}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#4CFF8A] mr-2 inline-block" />
          <span className="font-semibold uppercase tracking-wider text-[#4CFF8A]">
            ORIGINAL ANATOMICAL MODEL
          </span>
        </div>
      </div>

      {/* Screen-Projected 3D Hotspot Markers (Follows continuous rotation) */}
      {!loading &&
        hotspots.map((hs) => {
          const coords = pinScreens[hs.id];
          if (!coords || !coords.visible) return null;

          const isSelected = selectedRegion === hs.id;
          const pinColor =
            hs.status === 'HIGH RISK'
              ? '#DC2626'
              : hs.status === 'ELEVATED'
              ? '#D97706'
              : hs.status === 'CAUTION'
              ? '#B45309'
              : isDark
              ? '#4CFF8A'
              : '#0D7A3E';

          return (
            <div
              key={hs.id}
              style={{
                position: 'absolute',
                left: `${coords.x}px`,
                top: `${coords.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 25 : 15,
              }}
              className="group pointer-events-auto"
            >
              <button
                type="button"
                onClick={() => handleSelectHotspot(hs.id)}
                className="relative flex items-center justify-center cursor-pointer focus:outline-none"
                title={`${hs.name} (${hs.status})`}
              >
                {/* Outer pulsing ring for critical/selected markers */}
                {isSelected && (
                  <span
                    className="absolute w-7 h-7 rounded-full animate-ping opacity-75"
                    style={{ backgroundColor: pinColor }}
                  />
                )}
                {/* Core Hotspot Box */}
                <span
                  className={`relative flex items-center justify-center w-6 h-6 border transition-all ${
                    isSelected
                      ? `${
                          isDark
                            ? 'border-[#FFFFFF] bg-[#020A05] shadow-[0_0_12px_rgba(76,255,138,0.6)]'
                            : 'border-[#0E2E1B] bg-[#FFFFFF] shadow-md'
                        } scale-110`
                      : `${
                          isDark
                            ? 'border-[#12612F] bg-[#04130A]/90 hover:border-[#4CFF8A]'
                            : 'border-[#C8E2CF] bg-[#FFFFFF]/95 hover:border-[#0E793C]'
                        }`
                  }`}
                  style={{ borderRadius: '2px' }}
                >
                  <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: pinColor }} />
                </span>
              </button>

              {/* Hover Tooltip Box */}
              <div
                className={`absolute left-7 top-1/2 -translate-y-1/2 border text-[9px] font-mono uppercase tracking-wider px-2 py-1 whitespace-nowrap pointer-events-none shadow-lg z-30 ${
                  isDark
                    ? 'bg-[#020A05]/95 border-[#12612F] text-[#B6FFCC]'
                    : 'bg-[#FFFFFF]/95 border-[#C8E2CF] text-[#0E2E1B]'
                } ${isSelected ? 'block' : 'hidden group-hover:block'}`}
              >
                <div className="font-bold flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: pinColor }} />
                  <span>{hs.name}</span>
                </div>
                <div className={`text-[8px] lowercase ${isDark ? 'text-[#2FBF63]' : 'text-[#236B3D]'}`}>
                  click to inspect regional airway mechanics
                </div>
              </div>
            </div>
          );
        })}

      {/* Bottom HUD: Telemetry State & Guidance */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
        {/* Respiration Toggle Button */}
        <div
          className={`pointer-events-auto flex items-center space-x-1.5 backdrop-blur-sm border p-1 text-[9px] font-mono ${hudBgClass}`}
        >
          <button
            type="button"
            onClick={() => setBreathingEnabled(!breathingEnabled)}
            className={`px-2 py-1 border transition-all uppercase ${
              breathingEnabled
                ? isDark
                  ? 'border-[#4CFF8A] text-[#4CFF8A] bg-[#12612F]/30'
                  : 'border-[#0E793C] text-[#0E793C] bg-[#EAF3EC]'
                : isDark
                ? 'border-transparent text-[#2FBF63] hover:text-[#4CFF8A]'
                : 'border-transparent text-[#236B3D] hover:text-[#0E2E1B]'
            }`}
            title="Toggle Physiological Breathing Oscillation"
          >
            BREATHE: {breathingEnabled ? 'ON' : 'PAUSED'}
          </button>
        </div>

        {/* Locked Viewport Indicator */}
        <div
          className={`backdrop-blur-sm border px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest hidden sm:block ${hudBgClass}`}
        >
          ◈ FIXED VIEWPORT &bull; CONTINUOUS SLOW ROTATION &bull; PIN TO INSPECT
        </div>
      </div>
    </div>
  );
}
