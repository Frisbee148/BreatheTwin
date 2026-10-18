'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PATIENTS, Patient } from '@/lib/data';
import { getPatients } from '@/lib/api';
import { mapRiskToPlainWord } from '@/lib/api';

export default function DualLoginPage() {
  const router = useRouter();
  const { session, loginAsDoctor, loginAsPatient } = useAuth();

  const [patients, setPatients] = useState<Patient[]>(PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    session.patientId || 'PT-8821'
  );
  const [doctorName, setDoctorName] = useState<string>('Dr. Vikram Mehta, MD');
  const [doctorIdInput, setDoctorIdInput] = useState<string>('DOC-101 • AIIMS / Pulmonology');
  const [patientPin, setPatientPin] = useState<string>('8821');

  useEffect(() => {
    let isMounted = true;
    getPatients().then((pts) => {
      if (isMounted && pts && pts.length > 0) {
        setPatients(pts);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedPatient =
    patients.find((p) => p.id === selectedPatientId) || PATIENTS[0];

  const handleDoctorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginAsDoctor(doctorName);
    router.push('/patients');
  };

  const handlePatientLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginAsPatient(selectedPatient.id, selectedPatient.name);
    router.push('/patient-portal');
  };

  return (
    <div className="max-w-[1140px] mx-auto space-y-8 py-4">
      {/* Header Banner */}
      <div className="border-b border-[#12612F] pb-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-[#2FBF63]">
            {'// DUAL-INTERFACE ACCESS CONTROL • ROLE GATEWAY'}
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#B6FFCC] tracking-tight mt-1">
            Select Your BreathTwin Interface
          </h1>
          <p className="text-sm text-[#4CFF8A] mt-1.5 max-w-2xl">
            BreathTwin separates clinical decision-support from patient self-management. Doctors inspect full cohort probabilities, latent ODE states, and SHAP attributions; Patients see only their own plain-language status, non-medication what-if, daily log, and guardrailed forecast chat.
          </p>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] px-4 py-2.5 text-xs font-mono shrink-0">
          <div className="text-[10px] uppercase text-[#2FBF63]">ACTIVE SESSION</div>
          <div className="text-sm font-bold text-[#B6FFCC] mt-0.5">
            {session.role === 'doctor' ? 'DOCTOR' : 'PATIENT'}: {session.name}
          </div>
          <div className="text-[11px] text-[#4CFF8A]">{session.subtitle}</div>
        </div>
      </div>

      {/* Dual Login Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* =========================================================================
            1. DOCTOR LOGIN CARD
        ========================================================================= */}
        <div className="lg:col-span-6 border border-[#12612F] bg-[#04130A] p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#2FBF63]">
                  INTERFACE 01 • CLINICIAN PORTAL
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-[#B6FFCC] mt-0.5">
                  Treating Doctor Login
                </h2>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono font-bold border border-[#4CFF8A] bg-[#061C0E] text-[#4CFF8A] uppercase">
                ALL-COHORT ACCESS
              </span>
            </div>

            <p className="text-sm text-[#75FFA5] leading-relaxed">
              Full access to all monitored patients, 24h &amp; 48h conformal risk probabilities, latent airway inflammation state I(t), 7-day sensor waveforms, ranked SHAP drivers, and pharmacological + environmental What-If simulations.
            </p>

            {/* Doctor Capabilities List */}
            <div className="border border-[#12612F]/50 bg-[#020A05] p-4 space-y-2 text-xs">
              <div className="font-mono text-[11px] uppercase text-[#2FBF63] font-semibold">
                {'// DOCTOR INTERFACE PERMISSIONS'}
              </div>
              <ul className="space-y-1.5 text-[#B6FFCC]">
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>View &amp; filter entire patient cohort ranked by 48-hour flare-up probability</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Inspect raw telemetry charts (SpO2, RR, RHR, I(t)) &amp; conformal 90% CIs</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Run full counterfactual sandbox including ICS controller adherence adjustments</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Enroll new patient twins &amp; generate clinician Copilot evaluation drafts</span>
                </li>
              </ul>
            </div>

            <form onSubmit={handleDoctorLogin} className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="doctor-name-input"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1"
                >
                  CLINICIAN NAME &amp; CREDENTIALS
                </label>
                <input
                  id="doctor-name-input"
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#4CFF8A]"
                />
              </div>

              <div>
                <label
                  htmlFor="doctor-id-input"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1"
                >
                  CLINICAL LICENSE / DEPARTMENT ID
                </label>
                <input
                  id="doctor-id-input"
                  type="text"
                  value={doctorIdInput}
                  onChange={(e) => setDoctorIdInput(e.target.value)}
                  className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#4CFF8A]"
                />
              </div>

              <button
                type="submit"
                className="w-full h-11 mt-2 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-[#4CFF8A] transition-colors cursor-pointer"
              >
                LOGIN AS TREATING DOCTOR &rarr;
              </button>
            </form>
          </div>

          <div className="border-t border-[#12612F]/40 pt-3 flex items-center justify-between text-[11px] font-mono text-[#2FBF63]">
            <span>ROLE: CLINICIAN_ADMIN</span>
            <span>SCOPE: ALL PATIENTS + BENCHMARKS</span>
          </div>
        </div>

        {/* =========================================================================
            2. PATIENT LOGIN CARD
        ========================================================================= */}
        <div className="lg:col-span-6 border border-[#4CFF8A] bg-[#04130A] p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#12612F]/60 pb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#2FBF63]">
                  INTERFACE 02 • PERSONAL HEALTH PORTAL
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-[#B6FFCC] mt-0.5">
                  Patient Personal Login
                </h2>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono font-bold border border-[#FFE14A] bg-[#061C0E] text-[#FFE14A] uppercase">
                SINGLE-PATIENT SCOPE
              </span>
            </div>

            <p className="text-sm text-[#75FFA5] leading-relaxed">
              Isolated to your own record only. Built for clarity and safety: shows one plain-language status (<strong className="text-white">Low</strong>, <strong className="text-white">Watch</strong>, or <strong className="text-white">High</strong>) with no raw probabilities, simplified personal signals, non-medication what-if, daily log, care plan, and guardrailed Forecast Chat.
            </p>

            {/* Patient Guardrails List */}
            <div className="border border-[#12612F]/50 bg-[#020A05] p-4 space-y-2 text-xs">
              <div className="font-mono text-[11px] uppercase text-[#2FBF63] font-semibold">
                {'// PATIENT SAFETY & PRIVACY GUARDRAILS'}
              </div>
              <ul className="space-y-1.5 text-[#B6FFCC]">
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Strictly restricted to your own details — cannot view other patients or cohort lists</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Plain-language status (Low / Watch / High) and signals (&ldquo;normal for you&rdquo; vs &ldquo;different from your usual&rdquo;)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>Non-medication What-If only (stay indoors, wear mask, clean air) — no treatment experimentation</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-[#4CFF8A] font-bold">✓</span>
                  <span>LLM RAG Forecast Chat under strict clinical safety guardrails</span>
                </li>
              </ul>
            </div>

            <form onSubmit={handlePatientLogin} className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="patient-select-login"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1"
                >
                  SELECT YOUR PATIENT ACCOUNT (DEMO PERSONAS)
                </label>
                <select
                  id="patient-select-login"
                  value={selectedPatientId}
                  onChange={(e) => {
                    setSelectedPatientId(e.target.value);
                    setPatientPin(e.target.value.replace('PT-', ''));
                  }}
                  className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#4CFF8A]"
                >
                  {patients.map((p) => {
                    const plainBand = mapRiskToPlainWord(p.riskLevel);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.id} — {p.name} ({p.city} • Today&apos;s Status: {plainBand})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="patient-id-readonly"
                    className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1"
                  >
                    PATIENT TWIN ID
                  </label>
                  <input
                    id="patient-id-readonly"
                    type="text"
                    readOnly
                    value={selectedPatient.id}
                    className="w-full bg-[#020A05] border border-[#12612F] text-[#4CFF8A] px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="patient-pin-input"
                    className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1"
                  >
                    ACCESS PASSCODE
                  </label>
                  <input
                    id="patient-pin-input"
                    type="password"
                    value={patientPin}
                    onChange={(e) => setPatientPin(e.target.value)}
                    className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#4CFF8A]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 mt-2 border border-[#4CFF8A] bg-[#0E793C] text-white hover:bg-[#4CFF8A] hover:text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                LOGIN AS {selectedPatient.name.toUpperCase()} ({selectedPatient.id}) &rarr;
              </button>
            </form>
          </div>

          <div className="border-t border-[#12612F]/40 pt-3 flex items-center justify-between text-[11px] font-mono text-[#2FBF63]">
            <span>ROLE: PATIENT_SELF</span>
            <span>SCOPE: ONLY {selectedPatient.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
