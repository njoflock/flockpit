export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { msAuthorizeUrl } from '@/lib/microsoft';
import { setOAuthState } from '@/lib/session';

// Inicia sesión con Microsoft: abre la pantalla de permisos de Microsoft.
export async function GET() {
  const state = randomBytes(16).toString('hex');
  setOAuthState('ms_state', state);
  return NextResponse.redirect(msAuthorizeUrl(state));
}
