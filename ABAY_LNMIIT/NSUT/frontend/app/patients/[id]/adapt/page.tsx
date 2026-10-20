import React, { Suspense } from 'react';
import PatientAdaptationView from '@/components/PatientAdaptationView';
import { PATIENTS } from '@/lib/data';
import { getPatient } from '@/lib/api';

export const dynamicParams = true;

export function generateStaticParams() {
  return PATIENTS.map((p) => ({
    id: p.id,
  }));
}

async function AdaptationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialPatient = await getPatient(id);
  return <PatientAdaptationView patientId={id} initialPatient={initialPatient} />;
}

export default function PatientAdaptationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm font-mono text-[#3DE07A] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING CLINICAL OUTLIER &amp; MODEL ADAPTATION STUDIO...
        </div>
      }
    >
      <AdaptationContent params={params} />
    </Suspense>
  );
}
