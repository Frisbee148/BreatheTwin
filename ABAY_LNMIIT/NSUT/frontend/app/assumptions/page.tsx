import { redirect } from 'next/navigation';

export default function AssumptionsPage() {
  redirect('/benchmarks?tab=assumptions');
}
