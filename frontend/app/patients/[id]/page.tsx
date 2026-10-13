import React, { Suspense } from 'react';
import PatientTwinView from '@/components/PatientTwinView';

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs font-mono text-[#2FBF63] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING PATIENT {id} PHYSIOLOGICAL TWIN...
        </div>
      }
    >
      <PatientTwinView patientId={id} />
    </Suspense>
  );
}
