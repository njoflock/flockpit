export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db, must } from '@/lib/db';
import { createSession, getSession } from '@/lib/session';
import { seedDemo } from '@/lib/demo';
import { env } from '@/lib/env';

// Entra con datos de ejemplo, sin conectar cuentas reales. Cada visitante tiene su propia demo.
export async function GET() {
  const current = await getSession();
  if (current?.demo) return NextResponse.redirect(`${env.appUrl()}/`);
  const oid = `demo-${randomBytes(6).toString('hex')}`;
  const user = (await must(db().from('users').insert({ ms_oid: oid, email: 'demo@flockpit.app', name: 'Natalia (demo)' }).select('id').single())) as { id: string };
  await seedDemo(user.id);
  await createSession({ uid: user.id, email: 'demo@flockpit.app', name: 'Natalia (demo)', demo: true });
  return NextResponse.redirect(`${env.appUrl()}/`);
}
