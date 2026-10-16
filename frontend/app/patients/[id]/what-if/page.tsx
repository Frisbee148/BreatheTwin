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
        <div className="p-8 text-center text-sm font-mono text-[#3DE07A] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING WHAT-IF SIMULATOR...
        </div>
      }
    >
      <WhatIfContent params={params} />
    </Suspense>
  );
}
