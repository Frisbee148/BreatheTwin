'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import StatusChip from './StatusChip';
import { Patient, PATIENTS } from '@/lib/data';

// Dynamically import Three.js 3D viewport to ensure SSR safety
const PulmonaryTwin3D = dynamic(() => import('./PulmonaryTwin3D'), {
  ssr: false,
  loading: () => (
    <div className="relative aspect-[4/3] w-full min-h-[380px] sm:min-h-[460px] flex flex-col items-center justify-center border border-[#12612F] bg-[#020A05]">
      <div className="w-8 h-8 border-2 border-[#12612F] border-t-[#4CFF8A] rounded-full animate-spin mb-3" />
      <span className="text-xs font-mono text-[#4CFF8A] uppercase tracking-widest">
        INITIALIZING PULMONARY TWIN 3D VIEWPORT...
      </span>
      <span className="text-[10px] font-mono text-[#2FBF63] mt-1">
        CALIBRATING THREE.JS WEBGL CONTEXT
      </span>
    </div>
  ),
});

interface RegionMarker {
  id: string;
  name: string;
  x: number; // percentage from left for 2D mode
  y: number; // percentage from top for 2D mode
  status: 'NORMAL' | 'CAUTION' | 'ELEVATED' | 'HIGH RISK';
  inflammationScore: string;
  airwayResistance: string;
  clinicalNote: string;
}

interface ThermalViewerProps {
  imageSrc?: string;
  patientName: string;
  patientId: string;
  overallStatus: 'NORMAL' | 'CAUTION' | 'ELEVATED' | 'HIGH RISK';
  patient?: Patient;
}

export default function ThermalViewer({
  imageSrc = '/images/lung-thermal.png',
  patientName,
  patientId,
  overallStatus,
  patient,
}: ThermalViewerProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('airway-tree');
  const [viewFormat, setViewFormat] = useState<'3d' | '2d'>('3d');

  // Resolve active patient details
  const activePatient: Patient = patient || PATIENTS.find(p => p.id === patientId) || {
    id: patientId,
    name: patientName,
    age: 38,
    gender: 'M',
    city: 'Delhi',
    station: 'Anand Vihar',
    severity: 'Severe Persistent',
    controllerMedication: 'Budesonide/Formoterol 400/12',
    controllerAdherence: 74,
    rescueMedication: 'Albuterol Sulfate 90mcg',
    baselineFEV1: 2.1,
    baselineFEV1Percent: 58,
    baselineFEV1FVC: 62,
    baselineRR: 14.5,
    baselineRHR: 68,
    allergens: ['Dust mites'],
    smokingHistory: 'Never smoker',
    comorbidities: ['Allergic rhinitis'],
    flareUpsLastYear: 3,
    risk24h: 78,
    risk24hInterval: [71, 84],
    risk48h: 84,
    risk48hInterval: [76, 91],
    riskLevel: overallStatus,
    activeAlert: true,
    alertHeadline: 'Elevated Risk Alert',
    alertTriggerTime: '10:30 AM',
    leadTimeHours: 18.5,
    estimatedInflammationState: overallStatus === 'HIGH RISK' ? 0.88 : overallStatus === 'ELEVATED' ? 0.68 : 0.28,
    inflammationThreshold: 0.65,
    currentTelemetry: {
      spo2: 93.4,
      rr: 18.4,
      rhr: 82,
      hrv: 24,
      sleepAwakenings: 3,
      deepSleepPercent: 11,
      steps: 4200,
      rescuePuffs24h: 4,
    },
    currentAirQuality: {
      pm25: 124,
      pm10: 210,
      aqi: 286,
      aqiCategory: 'Very Poor',
      temp: 18.4,
      humidity: 62,
    },
    shapReasons: [],
  };

  const infl = activePatient.estimatedInflammationState || 0.4;
  const isCritical = infl >= (activePatient.inflammationThreshold || 0.65) || overallStatus === 'HIGH RISK';

  // Dynamically calculated regional markers reflecting patient physiological status
  const markers: RegionMarker[] = [
    {
      id: 'airway-tree',
      name: 'Mainstem Tracheobronchial Junction',
      x: 50,
      y: 38,
      status: overallStatus,
      inflammationScore: `${infl.toFixed(2)} / 1.00 ${isCritical ? '(Critical)' : '(Controlled)'}`,
      airwayResistance: infl >= 0.7 ? '+62% above baseline' : infl >= 0.4 ? '+24% above baseline' : '+8% baseline',
      clinicalNote: 'High shear deposition zone for ambient PM2.5 particles. Mechanistic model indicates mucosal hypersecretion and smooth muscle constriction.'
    },
    {
      id: 'right-lobe',
      name: 'Right Upper Lobar Segment',
      x: 35,
      y: 45,
      status: overallStatus === 'HIGH RISK' ? 'ELEVATED' : 'NORMAL',
      inflammationScore: `${(infl * 0.78).toFixed(2)} / 1.00`,
      airwayResistance: infl >= 0.7 ? '+48% above baseline' : '+6% baseline',
      clinicalNote: 'Early signal drift detected via resting respiratory rate acceleration and localized alveolar air trapping.'
    },
    {
      id: 'left-lower',
      name: 'Left Lower Basilar Airway',
      x: 65,
      y: 62,
      status: overallStatus === 'HIGH RISK' ? 'HIGH RISK' : overallStatus === 'ELEVATED' ? 'CAUTION' : 'NORMAL',
      inflammationScore: `${Math.min(1.0, infl * 1.04).toFixed(2)} / 1.00 ${overallStatus === 'HIGH RISK' ? '(Peak Edema)' : ''}`,
      airwayResistance: infl >= 0.7 ? '+74% above baseline' : '+14% baseline',
      clinicalNote: 'Dependent lung zones during nocturnal supine posture. Linked directly to nighttime SpO2 desaturation episodes.'
    }
  ];

  const currentMarker = markers.find(m => m.id === selectedRegion) || markers[0];

  return (
    <div className="border border-[#12612F] bg-[#04130A] p-4 font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/40 pb-3 mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">
              {`// PHYSIOLOGICAL TWIN VIEWPORT • ${patientId}`}
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 border border-[#12612F] text-[#4CFF8A] bg-[#061C0E]">
              {viewFormat === '3d' ? '3D MESH ACTIVE' : '2D SCAN ACTIVE'}
            </span>
          </div>
          <div className="text-xs text-[#B6FFCC] font-mono mt-0.5">
            MODEL: KALMAN MECHANISTIC STATE ESTIMATOR I(t) &bull; REALISTIC ANATOMY
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* 3D vs 2D View Switcher */}
          <div className="flex items-center border border-[#12612F] bg-[#020A05] p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewFormat('3d')}
              className={`px-2.5 py-1 uppercase transition-all ${
                viewFormat === '3d'
                  ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                  : 'text-[#2FBF63] hover:text-[#4CFF8A]'
              }`}
            >
              3D TWIN
            </button>
            <button
              type="button"
              onClick={() => setViewFormat('2d')}
              className={`px-2.5 py-1 uppercase transition-all ${
                viewFormat === '2d'
                  ? 'bg-[#4CFF8A] text-[#020A05] font-bold'
                  : 'text-[#2FBF63] hover:text-[#4CFF8A]'
              }`}
            >
              2D SCAN
            </button>
          </div>

          <StatusChip status={overallStatus} size="sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Pulmonary Viewport */}
        <div className="lg:col-span-7">
          {viewFormat === '3d' ? (
            <PulmonaryTwin3D
              patient={activePatient}
              selectedRegion={selectedRegion}
              onSelectRegion={setSelectedRegion}
            />
          ) : (
            /* 2D Coronal Thermal Scan Fallback View */
            <div className="relative thermal-img aspect-[4/3] min-h-[380px] sm:min-h-[460px] w-full border border-[#12612F] bg-[#061C0E]">
              <Image
                src={imageSrc}
                alt={`Thermal pulmonary scan representation for ${patientName}`}
                fill
                className="object-cover"
                priority
              />

              {/* Interactive Anatomical Pins for 2D View */}
              {markers.map((marker) => {
                const isSelected = selectedRegion === marker.id;
                const pinColor = 
                  marker.status === 'HIGH RISK' ? '#FF2A1A' :
                  marker.status === 'ELEVATED' ? '#FFA61F' :
                  marker.status === 'CAUTION' ? '#FFE14A' : '#4CFF8A';

                return (
                  <button
                    key={marker.id}
                    onClick={() => setSelectedRegion(marker.id)}
                    style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group focus:outline-none z-10"
                    title={marker.name}
                  >
                    <span 
                      className={`relative flex items-center justify-center w-6 h-6 border ${
                        isSelected ? 'border-[#B6FFCC] bg-[#020A05]' : 'border-[#12612F] bg-[#04130A]/90'
                      }`}
                      style={{ borderRadius: 0 }}
                    >
                      <span 
                        className="w-2.5 h-2.5 inline-block"
                        style={{ backgroundColor: pinColor }}
                      />
                    </span>
                    <span className={`absolute ${marker.x > 50 ? 'right-7' : 'left-7'} top-1/2 -translate-y-1/2 bg-[#020A05] border border-[#12612F] text-[9px] font-mono uppercase tracking-widest text-[#B6FFCC] px-1.5 py-0.5 whitespace-nowrap hidden group-hover:block pointer-events-none z-20 shadow-md`}>
                      {marker.name}
                    </span>
                  </button>
                );
              })}

              {/* Overlay Coordinates HUD */}
              <div className="absolute top-2 left-2 bg-[#020A05]/85 border border-[#12612F] px-2 py-1 text-[9px] font-mono text-[#2FBF63] uppercase tracking-widest">
                PLANE: CORONAL THORACIC &bull; 2D EMISSION RECONSTRUCTION
              </div>
              <div className="absolute bottom-2 right-2 bg-[#020A05]/85 border border-[#12612F] px-2 py-1 text-[9px] font-mono text-[#4CFF8A] uppercase tracking-widest">
                &gt; TAP HOTSPOTS TO INSPECT
              </div>
            </div>
          )}
        </div>

        {/* Selected Region Readout Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between border border-[#12612F] bg-[#061C0E] p-4 text-xs">
          <div>
            <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2 mb-3">
              <div className="text-[10px] tracking-widest uppercase text-[#2FBF63]">
                &gt; REGION OF INTEREST DETAIL
              </div>
              <div className="text-[10px] font-mono text-[#4CFF8A]">
                ID: {selectedRegion}
              </div>
            </div>

            {/* Quick Regional Selector Buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {markers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedRegion(m.id)}
                  className={`px-2 py-1 text-[10px] font-mono border uppercase transition-colors ${
                    selectedRegion === m.id
                      ? 'border-[#4CFF8A] bg-[#12612F]/50 text-[#B6FFCC] font-bold'
                      : 'border-[#12612F]/60 text-[#2FBF63] hover:text-[#B6FFCC] hover:border-[#12612F]'
                  }`}
                >
                  {m.id === 'airway-tree' ? 'CARINA' : m.id === 'right-lobe' ? 'R-APICAL' : 'L-BASILAR'}
                </button>
              ))}
            </div>

            <div className="text-sm font-semibold text-[#B6FFCC] mb-2 uppercase tracking-wide">
              {currentMarker.name}
            </div>

            <div className="space-y-3 mt-3">
              <div className="border-t border-[#12612F]/40 pt-2 flex justify-between items-center">
                <span className="text-[#2FBF63] text-[11px] uppercase tracking-wider">REGIONAL STATUS</span>
                <StatusChip status={currentMarker.status} size="sm" />
              </div>

              <div className="border-t border-[#12612F]/40 pt-2 flex justify-between items-center">
                <span className="text-[#2FBF63] text-[11px] uppercase tracking-wider">INFLAMMATION I(t)</span>
                <span className="text-[#B6FFCC] font-mono font-semibold">{currentMarker.inflammationScore}</span>
              </div>

              <div className="border-t border-[#12612F]/40 pt-2 flex justify-between items-center">
                <span className="text-[#2FBF63] text-[11px] uppercase tracking-wider">AIRWAY RESISTANCE</span>
                <span className="text-[#FFA61F] font-mono font-semibold">{currentMarker.airwayResistance}</span>
              </div>

              <div className="border-t border-[#12612F]/40 pt-2">
                <div className="text-[#2FBF63] text-[11px] uppercase tracking-wider mb-1">PHYSIOLOGICAL MECHANISM</div>
                <p className="text-[11px] text-[#4CFF8A] leading-relaxed">
                  {currentMarker.clinicalNote}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#12612F] flex items-center justify-between text-[10px] text-[#2FBF63] font-mono">
            <span>FILTER: KALMAN LATENT STATE</span>
            <span className="text-[#4CFF8A]">AUDITABLE COEFFS &gt;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
