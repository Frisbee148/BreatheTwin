import { PATIENTS } from '@/lib/data';

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
  return <>{children}</>;
}
