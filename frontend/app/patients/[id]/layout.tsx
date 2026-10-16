import { Suspense } from 'react';
import { PATIENTS } from '@/lib/data';

export const dynamicParams = true;

export function generateStaticParams() {
  return PATIENTS.map((p) => ({
    id: p.id,
  }));
}

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
