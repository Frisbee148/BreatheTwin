'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Patient, PATIENTS } from '@/lib/data';
import { getPatients } from '@/lib/api';
import StatusChip from './StatusChip';

interface PatientNavHeaderProps {
  patient: Patient;
}

export default function PatientNavHeader({ patient }: PatientNavHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(PATIENTS);

  useEffect(() => {
    let isMounted = true;
    getPatients().then((pts) => {
      if (isMounted && pts && pts.length > 0) setPatients(pts);
    });
    return () => { isMounted = false; };
  }, []);

  const tabs = [
    { label: '[01] DIGITAL TWIN & SENSORS', href: `/patients/${patient.id}` },
    { label: '[02] 48H FORECAST & REASONS', href: `/patients/${patient.id}/forecast` },
    { label: '[03] WHAT-IF SANDBOX', href: `/patients/${patient.id}/what-if` },
    { label: '[04] CLINICAL ADAPTATION & OUTLIERS', href: `/patients/${patient.id}/adapt` },
    { label: '[05] PATIENT PORTAL VIEW', href: `/patient-portal?patientId=${patient.id}` },
  ];

  const allPatients = React.useMemo(() => {
    if (!patient || !patient.id) return patients;
    const exists = patients.some(p => p.id === patient.id);
    return exists ? patients : [patient, ...patients];
  }, [patients, patient]);

  return (
    <div className="border border-[#12612F] bg-[#04130A] p-4 sm:p-5 mb-6">
      {/* Top Breadcrumb and Patient Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#12612F]/50 pb-3 mb-4 text-xs">
        <div className="flex items-center space-x-2">
          <Link href="/patients" className="text-[#2FBF63] hover:text-[#4CFF8A] uppercase tracking-wider flex items-center">
            &larr; COHORT TRIAGE
          </Link>
          <span className="text-[#12612F]">/</span>
          <span className="text-[#B6FFCC] font-mono font-semibold">{patient.id}</span>
          <span className="text-[#2FBF63]">({patient.name})</span>
        </div>

        {/* Quick Patient Switcher */}
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="text-[#2FBF63] uppercase tracking-wider">SWITCH PATIENT:</span>
          <select 
            aria-label="Switch patient selection"
            value={patient.id}
            onChange={(e) => {
              const tabSuffix = pathname.endsWith('/forecast')
                ? '/forecast'
                : pathname.endsWith('/what-if')
                ? '/what-if'
                : pathname.endsWith('/adapt')
                ? '/adapt'
                : '';
              router.push(`/patients/${e.target.value}${tabSuffix}`);
            }}
            className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2 py-1 text-xs focus:outline-none focus:border-[#4CFF8A] font-mono"
            style={{ borderRadius: 0 }}
          >
            {allPatients.map(p => (
              <option key={p.id} value={p.id}>
                {p.id} - {p.name} ({p.risk48h}% Risk - {p.city})
              </option>
            ))}
          </select>
          <Link
            href="/patients?enroll=true"
            className="font-mono text-[11px] font-bold text-white bg-[#0E793C] hover:bg-[#2FBF63] hover:text-black border border-[#4CFF8A] px-2 py-1 transition-all flex items-center gap-1 cursor-pointer"
            title="Enroll a new patient digital twin"
          >
            + ENROLL
          </Link>
        </div>
      </div>

      {/* Patient Strip (Compact): patient ID & name, city & monitor, confirmed severity, controller adherence, clinical status chip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">PATIENT ID &amp; NAME</div>
          <div className="text-sm font-semibold text-[#B6FFCC]">
            <span className="font-mono text-[#4CFF8A] mr-1.5">{patient.id}</span>
            <span>{patient.name}</span>
          </div>
          <div className="text-[11px] text-[#2FBF63] font-mono">{patient.age}y &bull; {patient.gender === 'M' ? 'Male' : 'Female'}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">CITY &amp; MONITOR</div>
          <div className="text-sm font-semibold text-[#4CFF8A]">{patient.city}</div>
          <div className="text-[10px] text-[#2FBF63] truncate">{patient.station}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">CONFIRMED SEVERITY</div>
          <div className="text-sm font-semibold text-[#B6FFCC]">{patient.severity}</div>
          <div className="text-[11px] text-[#2FBF63]">FEV1: {patient.baselineFEV1Percent}% pred</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">CONTROLLER ADHERENCE</div>
          <div className="text-sm font-semibold text-[#B6FFCC]">{patient.controllerAdherence}%</div>
          <div className="text-[10px] text-[#2FBF63] truncate">{patient.controllerMedication}</div>
        </div>

        <div className="flex flex-col justify-center items-start lg:items-end">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63] mb-1">CLINICAL STATUS</div>
          <StatusChip status={patient.riskLevel} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-[#12612F] pt-3 space-x-2 sm:space-x-4 overflow-x-auto">
        {tabs.map(tab => {
          const isTabActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 text-xs uppercase tracking-wider font-medium whitespace-nowrap transition-colors border ${
                isTabActive 
                  ? 'border-[#4CFF8A] bg-[#020A05] text-[#B6FFCC] font-semibold underline underline-offset-4' 
                  : 'border-transparent text-[#2FBF63] hover:text-[#4CFF8A] hover:border-[#12612F]'
              }`}
              style={{ borderRadius: 0 }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
