import React, { Suspense } from 'react';
import PatientWhatIfView from '@/components/PatientWhatIfView';
import { PATIENTS } from '@/lib/data';
import { getPatient } from '@/lib/api';

export const dynamicParams = true;

export function generateStaticParams() {
  return PATIENTS.map((p) => ({
    id: p.id,
  }));
}

async function WhatIfContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialPatient = await getPatient(id);
  return <PatientWhatIfView patientId={id} initialPatient={initialPatient} />;
}

export default function PatientWhatIfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-10 text-center shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#0E793C] dark:text-[#4CFF8A] mb-2 uppercase tracking-wider">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A] animate-ping" />
            &gt; INITIALIZING WHAT-IF SIMULATOR...
          </div>
          <p className="text-xs text-[#24693D] dark:text-[#2FBF63] font-mono mt-1">
            Loading true multimodal digital twin state, live CPCB air quality, and neural forecast baselines...
          </p>
        </div>
      }
    >
      <WhatIfContent params={params} />
    </Suspense>
  );
}
