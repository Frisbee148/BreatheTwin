import { redirect } from 'next/navigation';

export default async function PatientPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const { patientId } = await searchParams;
  if (patientId) {
    redirect(`/patient-portal?patientId=${patientId}`);
  }
  redirect('/patient-portal');
}
