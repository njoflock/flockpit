import { NextRequest, NextResponse } from 'next/server';
import { db, must } from '@/lib/db';
import { syncUser } from '@/lib/sync';
import { env } from '@/lib/env';
export const maxDuration = 300;
// Sincronización programada para todos los usuarios con Microsoft conectado (también con la app cerrada).
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const users = (await must(db().from('connections').select('user_id').eq('provider', 'microsoft').eq('status', 'ok'))) as { user_id: string }[];
  const results: Record<string, unknown> = {};
  for (const u of users) results[u.user_id] = await syncUser(u.user_id).catch((e) => ({ error: String(e) }));
  return NextResponse.json({ users: users.length, results });
}
