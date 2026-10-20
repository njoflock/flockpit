import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Workspace from '@/components/Workspace';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const s = await getSession();
  if (!s) redirect('/login');
  return <Workspace firstName={(s.name || s.email).split(' ')[0]} />;
}
