'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    return gltfLoadingPromise.then(scene => scene.clone(true));
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

  return gltfLoadingPromise.then(scene => scene.clone(true));
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
  renderMode?: 'heatmap' | 'xray' | 'tissue';
  onRenderModeChange?: (mode: 'heatmap' | 'xray' | 'tissue') => void;
  className?: string;
}

export default function PulmonaryTwin3D({
  patient,
  selectedRegion,
  onSelectRegion,
  renderMode = 'heatmap',
  onRenderModeChange,
  className = '',
}: PulmonaryTwin3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [breathingEnabled, setBreathingEnabled] = useState<boolean>(true);
  const [respirationPhase, setRespirationPhase] = useState<'INSPIRATION' | 'EXPIRATION'>('INSPIRATION');
  const [internalRenderMode, setInternalRenderMode] = useState<'heatmap' | 'xray' | 'tissue'>(renderMode);

  // Screen projected coordinates for 3D hotspot pins
  const [pinScreens, setPinScreens] = useState<Record<string, { x: number; y: number; visible: boolean }>>({});

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  // Sync prop changes
  useEffect(() => {
    setInternalRenderMode(renderMode);
  }, [renderMode]);

  // Handle render mode change
  const handleModeChange = (mode: 'heatmap' | 'xray' | 'tissue') => {
    setInternalRenderMode(mode);
    if (onRenderModeChange) {
      onRenderModeChange(mode);
    }
  };

  // Hotspots positioned anatomically on the normalized lung coordinate space
  const hotspots: HotspotPin[] = [
    {
      id: 'airway-tree',
      name: 'Mainstem Tracheobronchial Junction',
      localPos: new THREE.Vector3(0.0, 0.025, 0.02),
      status: patient.riskLevel,
      description: 'Carina & primary bronchial bifurcation. Primary impaction zone for ambient PM2.5 particles.'
    },
    {
      id: 'right-lobe',
      name: 'Right Upper Lobar Segment',
      localPos: new THREE.Vector3(-0.065, 0.015, 0.035),
      status: patient.riskLevel === 'HIGH RISK' ? 'ELEVATED' : 'NORMAL',
      description: 'Right apical-posterior segment. Early ventilation-perfusion mismatch locus.'
    },
    {
      id: 'left-lower',
      name: 'Left Lower Basilar Airway',
      localPos: new THREE.Vector3(0.068, -0.095, 0.03),
      status: patient.riskLevel === 'HIGH RISK' ? 'HIGH RISK' : patient.riskLevel === 'ELEVATED' ? 'CAUTION' : 'NORMAL',
      description: 'Dependent basilar zone during nocturnal supine posture. Correlated with nocturnal SpO2 dips.'
    }
  ];

  // Detect and listen to theme changes
  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
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

    // Update lights
    const lights = scene.getObjectsByProperty('isLight', true);
    lights.forEach((l) => scene.remove(l));

    if (isDark) {
      // Cybernetic phosphor clinical lighting
      const ambientLight = new THREE.AmbientLight(0x0a2214, 2.2);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0x4cff8a, 2.8);
      keyLight.position.set(0.5, 1.0, 1.0);
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x12612f, 2.2);
      rimLight.position.set(-0.6, -0.5, -0.8);
      scene.add(rimLight);

      const topLight = new THREE.PointLight(0x5cff95, 2.0, 3.0);
      topLight.position.set(0, 0.8, 0.4);
      scene.add(topLight);
    } else {
      // Crisp clinical mint lighting
      const ambientLight = new THREE.AmbientLight(0xdcefe2, 2.8);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(0.6, 1.2, 1.2);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xa7f3d0, 2.0);
      fillLight.position.set(-0.8, 0.2, 0.6);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x10b981, 1.4);
      rimLight.position.set(0, -0.8, -0.6);
      scene.add(rimLight);
    }
  }, [isDark]);

  // Apply patient-specific shaders / materials dynamically to model meshes
  const applyPatientMaterials = useCallback(() => {
    if (!meshesRef.current.length) return;

    const infl = patient.estimatedInflammationState || 0.4;
    const isCritical = infl >= (patient.inflammationThreshold || 0.65) || patient.riskLevel === 'HIGH RISK';
    const isElevated = patient.riskLevel === 'ELEVATED' || infl >= 0.5;

    // Palette selection based on clinical risk & mode
    let baseColorHex: number;
    let emissiveColorHex: number;
    let emissiveIntensity: number;

    if (isDark) {
      if (isCritical) {
        baseColorHex = 0x8b0000; // Deep crimson
        emissiveColorHex = 0xff2a1a; // Neon danger flare
        emissiveIntensity = 0.85;
      } else if (isElevated) {
        baseColorHex = 0x92400e; // Deep amber
        emissiveColorHex = 0xffa61f; // Warning amber glow
        emissiveIntensity = 0.55;
      } else {
        baseColorHex = 0x064e3b; // Deep clinical emerald
        emissiveColorHex = 0x4cff8a; // Healthy phosphor green
        emissiveIntensity = 0.4;
      }
    } else {
      // Light theme: crisp clinical grading
      if (isCritical) {
        baseColorHex = 0xdc2626; // High visibility red
        emissiveColorHex = 0xef4444;
        emissiveIntensity = 0.35;
      } else if (isElevated) {
        baseColorHex = 0xd97706; // Clinical amber
        emissiveColorHex = 0xf59e0b;
        emissiveIntensity = 0.25;
      } else {
        baseColorHex = 0x0d7a3e; // Clinical forest green
        emissiveColorHex = 0x10b981;
        emissiveIntensity = 0.2;
      }
    }

    meshesRef.current.forEach((mesh, idx) => {
      const isAirwayTree = idx === 0 || mesh.name.includes('part01');

      if (internalRenderMode === 'heatmap') {
        // Semi-translucent physical tissue with volumetric glow
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: isAirwayTree 
            ? (isDark ? 0x2fbf63 : 0x0e793c) 
            : baseColorHex,
          emissive: isAirwayTree 
            ? (isDark ? (isCritical ? 0xff4d3d : 0x5cff95) : 0x047857) 
            : emissiveColorHex,
          emissiveIntensity: isAirwayTree ? emissiveIntensity * 1.2 : emissiveIntensity,
          roughness: isDark ? 0.35 : 0.4,
          metalness: 0.1,
          transmission: isDark ? 0.3 : 0.0,
          thickness: isDark ? 0.3 : 0.0,
          transparent: isDark,
          opacity: isDark ? 0.92 : 1.0,
          wireframe: false,
        });
      } else if (internalRenderMode === 'xray') {
        // Holographic wireframe + glowing internal lumen
        mesh.material = new THREE.MeshStandardMaterial({
          color: isDark ? 0x4cff8a : 0x0e793c,
          emissive: isDark ? (isCritical ? 0xff2a1a : 0x2fbf63) : 0x047857,
          emissiveIntensity: 0.6,
          wireframe: true,
          transparent: true,
          opacity: 0.75,
        });
      } else {
        // High-definition Anatomical Tissue render
        mesh.material = new THREE.MeshStandardMaterial({
          color: isDark ? 0x2a5438 : 0x15803d,
          emissive: isDark ? 0x092b15 : 0x052e16,
          emissiveIntensity: 0.2,
          roughness: 0.45,
          metalness: 0.05,
          wireframe: false,
        });
      }
    });
  }, [patient, isDark, internalRenderMode]);

  // Update materials when patient, theme, or render mode changes
  useEffect(() => {
    applyPatientMaterials();
  }, [applyPatientMaterials]);

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

    // 2. Camera
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
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    // Attach canvas
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.25;
    controls.maxDistance = 1.4;
    controls.target.set(0, 0, 0);
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.9;
    controlsRef.current = controls;

    // Root group for patient breathing & pivot transformations
    const rootModelGroup = new THREE.Group();
    modelGroupRef.current = rootModelGroup;
    scene.add(rootModelGroup);

    // Subtle coordinate plane reference grid
    const gridHelper = new THREE.GridHelper(0.8, 16, 0x12612f, isDark ? 0x062312 : 0xc8e2cf);
    gridHelper.position.y = -0.22;
    scene.add(gridHelper);

    // 5. Load and center the GLB Model
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

        // Collect meshes
        const meshes: THREE.Mesh[] = [];
        clonedScene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            meshes.push(child as THREE.Mesh);
          }
        });
        meshesRef.current = meshes;

        rootModelGroup.add(clonedScene);
        applyPatientMaterials();
        setLoading(false);
      })
      .catch((err) => {
        console.error('PulmonaryTwin3D load error:', err);
        setLoadError('Failed to load 3D anatomical model');
        setLoading(false);
      });

    // 6. Animation & Respiration Cycle Loop
    let startTime = performance.now();
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsed = (performance.now() - startTime) / 1000;

      // Update controls
      controls.update();

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

      // Project 3D Hotspot Coordinates to 2D Container Screen Coordinates
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
      width = container.clientWidth;
      height = container.clientHeight;
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
  }, [isDark, applyPatientMaterials, breathingEnabled, patient.currentTelemetry?.rr, patient.baselineRR]);

  // Update controls auto-rotate when state changes
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Reset Camera View
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0.02, 0.62);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // Focus Camera toward a specific Hotspot
  const handleFocusHotspot = (hsId: string) => {
    onSelectRegion(hsId);
    const hs = hotspots.find(h => h.id === hsId);
    if (!hs || !cameraRef.current || !controlsRef.current || !modelGroupRef.current) return;

    const targetPos = hs.localPos.clone().applyMatrix4(modelGroupRef.current.matrixWorld);
    controlsRef.current.target.copy(targetPos);
    controlsRef.current.update();
  };

  const rrValue = patient.currentTelemetry?.rr || patient.baselineRR || 16;
  const inflVal = patient.estimatedInflammationState || 0.4;
  const isHighRisk = inflVal >= (patient.inflammationThreshold || 0.65) || patient.riskLevel === 'HIGH RISK';

  // Dynamic Theme Styling Tokens for HUD
  const hudBgClass = isDark 
    ? 'bg-[#020A05]/85 border-[#12612F] text-[#B6FFCC]' 
    : 'bg-[#FFFFFF]/90 border-[#C8E2CF] text-[#0E2E1B] shadow-sm';

  const badgeHeaderClass = isDark
    ? 'text-[#2FBF63]'
    : 'text-[#236B3D]';

  const activeBtnClass = isDark
    ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
    : 'bg-[#0E793C] text-[#FFFFFF] font-bold';

  const inactiveBtnClass = isDark
    ? 'text-[#2FBF63] hover:text-[#4CFF8A]'
    : 'text-[#236B3D] hover:text-[#0E2E1B]';

  return (
    <div className={`relative w-full aspect-[4/3] min-h-[380px] sm:min-h-[460px] overflow-hidden border ${isDark ? 'border-[#12612F] bg-[#020A05]' : 'border-[#C8E2CF] bg-[#F4F8F5]'} select-none ${className}`}>
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${isDark ? 'bg-[#020A05]/90' : 'bg-[#F4F8F5]/90'} z-30`}>
          <div className="w-10 h-10 border-2 border-[#12612F] border-t-[#4CFF8A] rounded-full animate-spin mb-3" />
          <div className={`text-xs font-mono uppercase tracking-widest ${isDark ? 'text-[#4CFF8A]' : 'text-[#0E793C]'}`}>
            SYNCHRONIZING PULMONARY TWIN 3D MESH...
          </div>
          <div className={`text-[10px] font-mono mt-1 ${isDark ? 'text-[#2FBF63]' : 'text-[#236B3D]'}`}>
            PARSING ANATOMICAL LUNG MORPHOLOGY ({patient.id})
          </div>
        </div>
      )}

      {/* Error Fallback */}
      {loadError && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${isDark ? 'bg-[#020A05]/95' : 'bg-[#FFFFFF]/95'} z-30 p-6 text-center`}>
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
        <div className={`pointer-events-auto backdrop-blur-sm border px-2.5 py-1 text-[10px] font-mono flex items-center space-x-3 ${hudBgClass}`}>
          <span className={`${badgeHeaderClass} uppercase tracking-widest font-semibold`}>
            {`3D TWIN: ${patient.id}`}
          </span>
          <span className="opacity-30">|</span>
          <span>
            RR: <strong className={rrValue >= 18 ? 'text-[#DC2626]' : (isDark ? 'text-[#4CFF8A]' : 'text-[#0E793C]')}>{rrValue.toFixed(1)}</strong> bpm
          </span>
          <span className="opacity-30">|</span>
          <span className="flex items-center space-x-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${respirationPhase === 'INSPIRATION' ? (isDark ? 'bg-[#4CFF8A] animate-ping' : 'bg-[#0E793C] animate-ping') : (isDark ? 'bg-[#2FBF63]' : 'bg-[#236B3D]')}`} />
            <span className={`text-[9px] ${isDark ? 'text-[#4CFF8A]' : 'text-[#0E793C]'}`}>{respirationPhase}</span>
          </span>
        </div>

        {/* Right: Render Shading Mode Toggles */}
        <div className={`pointer-events-auto flex items-center border backdrop-blur-sm p-0.5 text-[10px] font-mono ${hudBgClass}`}>
          <button
            type="button"
            onClick={() => handleModeChange('heatmap')}
            className={`px-2 py-0.5 transition-colors uppercase ${
              internalRenderMode === 'heatmap' ? activeBtnClass : inactiveBtnClass
            }`}
            title="Inflammation & Strain Heatmap"
          >
            HEATMAP
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('xray')}
            className={`px-2 py-0.5 transition-colors uppercase ${
              internalRenderMode === 'xray' ? activeBtnClass : inactiveBtnClass
            }`}
            title="Holographic Airway Wireframe"
          >
            HOLO X-RAY
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('tissue')}
            className={`px-2 py-0.5 transition-colors uppercase ${
              internalRenderMode === 'tissue' ? activeBtnClass : inactiveBtnClass
            }`}
            title="Photorealistic Tissue Shading"
          >
            ANATOMICAL
          </button>
        </div>
      </div>

      {/* Screen-Projected 3D Hotspot Markers */}
      {!loading && hotspots.map((hs) => {
        const coords = pinScreens[hs.id];
        if (!coords || !coords.visible) return null;

        const isSelected = selectedRegion === hs.id;
        const pinColor =
          hs.status === 'HIGH RISK' ? '#DC2626' :
          hs.status === 'ELEVATED' ? '#D97706' :
          hs.status === 'CAUTION' ? '#B45309' : (isDark ? '#4CFF8A' : '#0D7A3E');

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
              onClick={() => handleFocusHotspot(hs.id)}
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
                    ? `${isDark ? 'border-[#FFFFFF] bg-[#020A05] shadow-[0_0_12px_rgba(76,255,138,0.6)]' : 'border-[#0E2E1B] bg-[#FFFFFF] shadow-md'} scale-110`
                    : `${isDark ? 'border-[#12612F] bg-[#04130A]/90 hover:border-[#4CFF8A]' : 'border-[#C8E2CF] bg-[#FFFFFF]/95 hover:border-[#0E793C]'}`
                }`}
                style={{ borderRadius: '2px' }}
              >
                <span
                  className="w-2.5 h-2.5 inline-block"
                  style={{ backgroundColor: pinColor }}
                />
              </span>
            </button>

            {/* Hover Tooltip Box */}
            <div
              className={`absolute left-7 top-1/2 -translate-y-1/2 border text-[9px] font-mono uppercase tracking-wider px-2 py-1 whitespace-nowrap pointer-events-none shadow-lg z-30 ${
                isDark ? 'bg-[#020A05]/95 border-[#12612F] text-[#B6FFCC]' : 'bg-[#FFFFFF]/95 border-[#C8E2CF] text-[#0E2E1B]'
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

      {/* Bottom HUD: Camera Controls & Guidance */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
        {/* Viewport Control Buttons */}
        <div className={`pointer-events-auto flex items-center space-x-1.5 backdrop-blur-sm border p-1 text-[9px] font-mono ${hudBgClass}`}>
          <button
            type="button"
            onClick={handleResetCamera}
            className={`px-2 py-1 border border-transparent transition-all uppercase ${
              isDark ? 'text-[#2FBF63] hover:text-[#4CFF8A] hover:bg-[#12612F]/40 hover:border-[#12612F]' : 'text-[#236B3D] hover:text-[#0E2E1B] hover:bg-[#EAF3EC] hover:border-[#C8E2CF]'
            }`}
            title="Reset to Coronal View"
          >
            [RESET VIEW]
          </button>
          <span className="opacity-20">|</span>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2 py-1 border transition-all uppercase ${
              autoRotate
                ? (isDark ? 'border-[#4CFF8A] text-[#4CFF8A] bg-[#12612F]/30' : 'border-[#0E793C] text-[#0E793C] bg-[#EAF3EC]')
                : (isDark ? 'border-transparent text-[#2FBF63] hover:text-[#4CFF8A]' : 'border-transparent text-[#236B3D] hover:text-[#0E2E1B]')
            }`}
            title="Toggle Clinical Auto-Rotation"
          >
            ORBIT: {autoRotate ? 'ON' : 'OFF'}
          </button>
          <span className="opacity-20">|</span>
          <button
            type="button"
            onClick={() => setBreathingEnabled(!breathingEnabled)}
            className={`px-2 py-1 border transition-all uppercase ${
              breathingEnabled
                ? (isDark ? 'border-[#4CFF8A] text-[#4CFF8A] bg-[#12612F]/30' : 'border-[#0E793C] text-[#0E793C] bg-[#EAF3EC]')
                : (isDark ? 'border-transparent text-[#2FBF63] hover:text-[#4CFF8A]' : 'border-transparent text-[#236B3D] hover:text-[#0E2E1B]')
            }`}
            title="Toggle Physiological Breathing Oscillation"
          >
            BREATHE: {breathingEnabled ? 'ON' : 'PAUSED'}
          </button>
        </div>

        {/* Interaction Hint */}
        <div className={`backdrop-blur-sm border px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest hidden sm:block ${hudBgClass}`}>
          &gt; DRAG TO ROTATE &bull; SCROLL TO ZOOM &bull; PIN TO INSPECT
        </div>
      </div>
    </div>
  );
}
