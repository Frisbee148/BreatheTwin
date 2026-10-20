import React, { Suspense } from 'react';
import PatientForecastView from '@/components/PatientForecastView';
import { PATIENTS } from '@/lib/data';
import { getPatient, getPatientForecast } from '@/lib/api';

export const dynamicParams = true;

export function generateStaticParams() {
  return PATIENTS.map((p) => ({
    id: p.id,
  }));
}

async function ForecastContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [initialPatient, initialForecast] = await Promise.all([
    getPatient(id),
    getPatientForecast(id),
  ]);
  return (
    <PatientForecastView
      patientId={id}
      initialPatient={initialPatient}
      initialForecast={initialForecast}
    />
  );
}

export default function PatientForecastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm font-mono text-[#3DE07A] border border-[#12612F] bg-[#04130A]">
          &gt; INITIALIZING FORECAST MODELS...
        </div>
      }
    >
      <ForecastContent params={params} />
    </Suspense>
  );
}
