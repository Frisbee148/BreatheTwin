'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PATIENTS, Patient } from '@/lib/data';
import { getPatients, getPatient } from '@/lib/api';

export default function PatientPreviewPage() {
  const [patients, setPatients] = useState<Patient[]>(PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('PT-8821');
  const [patient, setPatient] = useState<Patient>(PATIENTS[0]);
  const [inhalerConfirmed, setInhalerConfirmed] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    getPatients().then((pts) => {
      if (isMounted && pts && pts.length > 0) {
        setPatients(pts);
      }
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    getPatient(selectedPatientId).then((livePatient) => {
      if (isMounted && livePatient) {
        setPatient(livePatient);
      }
    });
    return () => { isMounted = false; };
  }, [selectedPatientId]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-[#12612F] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// PATIENT EXPERIENCE &bull; PRD SECTION 3 &amp; 4 COMPLIANCE`}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#B6FFCC] tracking-wide mt-1">
            Patient Mobile Notification Mockup
          </h1>
          <p className="text-xs text-[#4CFF8A] mt-1 max-w-2xl">
            A plain-language smartphone view translating twin risk into practical daily actions for the patient (avoiding emergency room admissions).
          </p>
        </div>

        {/* Patient Switcher */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-[#2FBF63] uppercase">PREVIEW PATIENT:</span>
          <select
            value={selectedPatientId}
            onChange={(e) => {
              setSelectedPatientId(e.target.value);
              setInhalerConfirmed(false);
            }}
            className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2 py-1.5 text-xs focus:outline-none focus:border-[#4CFF8A] font-mono"
            style={{ borderRadius: 0 }}
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Mockup Frame */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Smartphone Shell (Phosphor Green Terminal Phone) */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-[360px] border-2 border-[#12612F] bg-[#020A05] p-4 shadow-2xl relative">
            {/* Phone Top Notch / Speaker Bar */}
            <div className="w-28 h-1 bg-[#12612F] mx-auto mb-3" />
            
            {/* Status bar */}
            <div className="flex justify-between items-center text-[10px] font-mono text-[#2FBF63] border-b border-[#12612F]/40 pb-2 mb-4">
              <span>06:15 IST &bull; 5G IND</span>
              <span>BATTERY: 94%</span>
            </div>

            {/* App Header */}
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-6 h-6 border border-[#4CFF8A] flex items-center justify-center font-mono font-bold text-[#4CFF8A] text-xs">
                BT
              </div>
              <div>
                <div className="text-xs font-bold text-[#B6FFCC] tracking-wider uppercase">
                  BREATHTWIN MOBILE
                </div>
                <div className="text-[9px] text-[#2FBF63] font-mono">
                  PATIENT: {patient.name.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Alert Card in Phone */}
            <div className={`border p-4 mb-4 space-y-3 ${
              patient.riskLevel === 'HIGH RISK' 
                ? 'border-[#FF2A1A] bg-[#04130A]' 
                : 'border-[#12612F] bg-[#04130A]'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 border ${
                  patient.riskLevel === 'HIGH RISK'
                    ? 'border-[#FF2A1A] text-[#FF2A1A]'
                    : 'border-[#4CFF8A] text-[#4CFF8A]'
                }`}>
                  {patient.riskLevel === 'HIGH RISK' ? '! AIR QUALITY & HEALTH ALERT' : 'DAILY ASTHMA ADVICE'}
                </span>
                <span className="text-[10px] text-[#2FBF63] font-mono">TODAY</span>
              </div>

              <div className="text-xs font-semibold text-[#B6FFCC] leading-snug">
                {patient.riskLevel === 'HIGH RISK'
                  ? `Severe air pollution in ${patient.city} today (${patient.currentAirQuality.pm25} µg/m³). Your breathing was slightly faster overnight.`
                  : `Air quality in ${patient.city} is stable. Your lung trends look normal today.`}
              </div>

              {/* Action checklist */}
              <div className="space-y-2 border-t border-[#12612F]/40 pt-2 text-[11px]">
                <div className="text-[#2FBF63] uppercase tracking-wider text-[10px] font-bold">
                  WHAT TO DO THIS MORNING:
                </div>
                
                <div className="flex items-start space-x-2 text-[#4CFF8A]">
                  <span className="text-[#B6FFCC] font-bold">&bull;</span>
                  <span>Wear an N95 mask when traveling outdoors.</span>
                </div>

                <div className="flex items-start space-x-2 text-[#4CFF8A]">
                  <span className="text-[#B6FFCC] font-bold">&bull;</span>
                  <span>Take your scheduled controller inhaler ({patient.controllerMedication.split('(')[0]}).</span>
                </div>

                <div className="flex items-start space-x-2 text-[#4CFF8A]">
                  <span className="text-[#B6FFCC] font-bold">&bull;</span>
                  <span>Keep your rescue inhaler ({patient.rescueMedication}) in your bag.</span>
                </div>
              </div>

              {/* Inhaler Check-in Action Button */}
              <div className="pt-2">
                <button
                  onClick={() => setInhalerConfirmed(true)}
                  disabled={inhalerConfirmed}
                  className={`w-full py-2 text-xs uppercase tracking-wider font-semibold border transition-colors ${
                    inhalerConfirmed
                      ? 'border-[#4CFF8A] bg-[#4CFF8A] text-white dark:text-[#020A05]'
                      : 'border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-white dark:hover:text-[#020A05]'
                  }`}
                  style={{ borderRadius: 0 }}
                >
                  {inhalerConfirmed ? '&check; INHALER DOSE CONFIRMED' : 'LOG MORNING INHALER DOSE'}
                </button>
              </div>
            </div>

            {/* Environmental Widget */}
            <div className="border border-[#12612F] bg-[#061C0E] p-3 text-xs space-y-1 mb-3">
              <div className="text-[10px] text-[#2FBF63] uppercase font-mono">LOCAL AIR QUALITY MONITOR</div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-[#FFE14A]">{patient.city} ({patient.station})</span>
                <span className="font-mono text-sm text-[#FF2A1A]">AQI {patient.currentAirQuality.aqi}</span>
              </div>
              <div className="text-[10px] text-[#2FBF63]">
                PM2.5: {patient.currentAirQuality.pm25} µg/m³ &bull; Status: {patient.currentAirQuality.aqiCategory}
              </div>
            </div>

            {/* Phone Home Bar */}
            <div className="w-20 h-1 bg-[#12612F] mx-auto mt-4" />
          </div>
        </div>

        {/* Right Explanation Column */}
        <div className="lg:col-span-6 space-y-5 text-xs">
          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3">
            <div className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider border-b border-[#12612F]/40 pb-2">{`// DESIGN RATIONALE: PATIENT PERSONA IN THE DEMO`}</div>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              As articulated in PRD Section 4: The primary user is the treating physician, but the demo narrative follows an Indian working adult commuting in high pollution. Rather than overwhelming patients with medical jargon or differential equations, the mobile alert provides three concrete, evidence-backed actions:
            </p>
            <ul className="space-y-2 text-[#4CFF8A] list-disc list-inside">
              <li>Immediate N95 barrier protection during transit</li>
              <li>Medication reminder to boost controller compliance</li>
              <li>Pre-warning to carry emergency rescue relief</li>
            </ul>
          </div>

          <div className="border border-[#12612F] bg-[#04130A] p-5 space-y-3">
            <div className="text-xs font-semibold text-[#B6FFCC] uppercase tracking-wider border-b border-[#12612F]/40 pb-2">{`// DOCTOR DASHBOARD INTERCONNECTION`}</div>
            <p className="text-xs text-[#2FBF63] leading-relaxed">
              When the patient taps &ldquo;Log Morning Inhaler Dose&rdquo;, the simulation clock immediately updates their controller adherence in the doctor&apos;s digital twin dashboard, driving the Kalman filter inflammation state back down.
            </p>
            <div className="pt-2 flex items-center space-x-3">
              <Link
                href={`/patients/${patient.id}/what-if`}
                className="text-xs font-semibold text-[#4CFF8A] border border-[#4CFF8A] px-3 py-1.5 hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors uppercase"
              >
                TEST WHAT-IF INTERVENTION &gt;
              </Link>
              <Link
                href={`/patients/${patient.id}`}
                className="text-xs text-[#2FBF63] hover:text-[#4CFF8A] uppercase"
              >
                INSPECT TWIN
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
