import React, { Suspense } from 'react';
import PatientTwinView from '@/components/PatientTwinView';
import { getPatient } from '@/lib/api';

// With `cacheComponents` enabled, reading request-time `params` must happen
// inside a <Suspense> boundary, so the await lives in a child component.
async function PatientContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialPatient = await getPatient(id);
  return <PatientTwinView patientId={id} initialPatient={initialPatient} />;
}

export default function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm font-mono text-[#3DE07A] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING PATIENT PHYSIOLOGICAL TWIN...
        </div>
      }
    >
      <PatientContent params={params} />
    </Suspense>
  );
}
