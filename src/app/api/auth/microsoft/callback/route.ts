export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { msExchangeCode, saveMsConnection } from '@/lib/microsoft';
import { createSession, takeOAuthState } from '@/lib/session';
import { db, must } from '@/lib/db';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const u = req.nextUrl, back = (msg: string) => NextResponse.redirect(`${env.appUrl()}/login?error=${encodeURIComponent(msg)}`);
  const err = u.searchParams.get('error_description') || u.searchParams.get('error');
  if (err) return back(err.includes('admin') ? 'Tu organización requiere que un administrador apruebe Flockpit. Usá el botón de Microsoft para pedir la aprobación.' : err);
  const state = takeOAuthState('ms_state');
  if (!state || state !== u.searchParams.get('state')) return back('La sesión de inicio expiró. Probá de nuevo.');
  try {
    const { token, oid, email, name } = await msExchangeCode(u.searchParams.get('code') || '');
    if (!oid) return back('Microsoft no devolvió la identidad del usuario.');
    const user = (await must(db().from('users').upsert({ ms_oid: oid, email, name }, { onConflict: 'ms_oid' }).select('id').single())) as { id: string };
    await saveMsConnection(user.id, oid, token);
    await createSession({ uid: user.id, email, name });
    return NextResponse.redirect(`${env.appUrl()}/?primera=1`);
  } catch (e) {
    return back(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
  }
}
