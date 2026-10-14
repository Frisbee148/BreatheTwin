'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import StatusChip from './StatusChip';

interface RegionMarker {
  id: string;
  name: string;
  x: number; // percentage from left
  y: number; // percentage from top
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
}

export default function ThermalViewer({
  imageSrc = '/images/lung-thermal.png',
  patientName,
  patientId,
  overallStatus
}: ThermalViewerProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('airway-tree');

  const markers: RegionMarker[] = [
    {
      id: 'airway-tree',
      name: 'Mainstem Tracheobronchial Junction',
      x: 50,
      y: 38,
      status: overallStatus,
      inflammationScore: overallStatus === 'HIGH RISK' ? '0.88 / 1.0 (Critical)' : '0.42 / 1.0 (Moderate)',
      airwayResistance: overallStatus === 'HIGH RISK' ? '+62% above baseline' : '+14% above baseline',
      clinicalNote: 'High shear deposition zone for ambient PM2.5. Latent model indicates mucosal hypersecretion and smooth muscle constriction.'
    },
    {
      id: 'right-lobe',
      name: 'Right Upper Lobar Segment',
      x: 35,
      y: 45,
      status: overallStatus === 'HIGH RISK' ? 'ELEVATED' : 'NORMAL',
      inflammationScore: overallStatus === 'HIGH RISK' ? '0.74 / 1.0' : '0.29 / 1.0',
      airwayResistance: overallStatus === 'HIGH RISK' ? '+48% above baseline' : '+8% above baseline',
      clinicalNote: 'Early signal drift detected via resting respiratory rate acceleration and localized alveolar air trapping.'
    },
    {
      id: 'left-lower',
      name: 'Left Lower Basilar Airway',
      x: 65,
      y: 62,
      status: overallStatus === 'HIGH RISK' ? 'HIGH RISK' : 'CAUTION',
      inflammationScore: overallStatus === 'HIGH RISK' ? '0.91 / 1.0 (Peak Edema)' : '0.48 / 1.0',
      airwayResistance: overallStatus === 'HIGH RISK' ? '+74% above baseline' : '+18% above baseline',
      clinicalNote: 'Dependent lung zones during nocturnal supine posture. Linked directly to nighttime SpO2 desaturation episodes.'
    }
  ];

  const currentMarker = markers.find(m => m.id === selectedRegion) || markers[0];

  return (
    <div className="border border-[#12612F] bg-[#04130A] p-4 font-sans">
      <div className="flex items-center justify-between border-b border-[#12612F]/40 pb-2 mb-3">
        <div>
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// PHYSIOLOGICAL TWIN VIEWPORT • ${patientId}`}</span>
          <div className="text-xs text-[#B6FFCC] font-mono mt-0.5">
            MODEL: KALMAN MECHANISTIC STATE ESTIMATOR I(t)
          </div>
        </div>
        <StatusChip status={overallStatus} size="sm" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Thermal Scan Viewport with interactive markers */}
        <div className="lg:col-span-7 relative thermal-img aspect-[4/3] w-full border border-[#12612F] bg-[#061C0E]">
          <Image
            src={imageSrc}
            alt={`Thermal pulmonary scan representation for ${patientName}`}
            fill
            className="object-cover"
            priority
          />

          {/* Interactive Anatomical Pins */}
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
            PLANE: CORONAL THORACIC &bull; OPTICAL EMISSION RECONSTRUCTION
          </div>
          <div className="absolute bottom-2 right-2 bg-[#020A05]/85 border border-[#12612F] px-2 py-1 text-[9px] font-mono text-[#4CFF8A] uppercase tracking-widest">
            &gt; TAP HOTSPOTS TO INSPECT
          </div>
        </div>

        {/* Selected Region Readout Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between border border-[#12612F] bg-[#061C0E] p-4 text-xs">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-[#2FBF63] mb-1">
              &gt; REGION OF INTEREST DETAIL
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
