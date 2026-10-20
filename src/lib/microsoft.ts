import { decodeJwt } from 'jose';
import { env } from './env';
import { db, must } from './db';
import { encrypt, decrypt } from './crypto';

// Permisos que se piden al conectarse. La pantalla de Microsoft se los muestra a la persona.
export const MS_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read', 'Chat.Read'];
const AUTH = () => `https://login.microsoftonline.com/${env.msTenant()}/oauth2/v2.0`;
export const msRedirect = () => `${env.appUrl()}/api/auth/microsoft/callback`;

export function msAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env.msClientId(), response_type: 'code', redirect_uri: msRedirect(), response_mode: 'query',
    scope: MS_SCOPES.join(' '), state, prompt: 'select_account',
  });
  return `${AUTH()}/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(`${AUTH()}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.msClientId(), client_secret: env.msClientSecret(), ...body }),
  });
  const j = (await r.json()) as TokenResponse;
  if (!r.ok || j.error) throw new Error(`Microsoft rechazó la autorización: ${j.error_description || j.error || r.status}`);
  return j;
}

export async function msExchangeCode(code: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: msRedirect(), scope: MS_SCOPES.join(' ') });
  const claims = t.id_token ? decodeJwt(t.id_token) : {};
  return {
    token: t,
    oid: String(claims.oid || ''),
    email: String(claims.preferred_username || claims.email || ''),
    name: String(claims.name || ''),
  };
}

export async function saveMsConnection(userId: string, oid: string, t: TokenResponse) {
  await must(db().from('connections').upsert({
    user_id: userId, provider: 'microsoft', external_user_id: oid, scopes: t.scope || MS_SCOPES.join(' '),
    access_token_enc: encrypt(t.access_token), refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), status: 'ok', last_error: null, updated_at: new Date().toISOString(),
  }));
}

// Devuelve un token vigente; lo renueva con el refresh token si venció.
export async function msToken(userId: string): Promise<string> {
  const c = await must(db().from('connections').select('*').eq('user_id', userId).eq('provider', 'microsoft').maybeSingle());
  if (!c) throw new Error('Microsoft 365 no está conectado.');
  const row = c as { access_token_enc: string; refresh_token_enc: string | null; expires_at: string; external_user_id: string };
  if (Date.parse(row.expires_at) > Date.now()) return decrypt(row.access_token_enc);
  if (!row.refresh_token_enc) throw new Error('La sesión de Microsoft venció. Volvé a iniciar sesión.');
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token_enc), scope: MS_SCOPES.join(' ') });
    await saveMsConnection(userId, row.external_user_id, { ...t, refresh_token: t.refresh_token || decrypt(row.refresh_token_enc) });
    return t.access_token;
  } catch (e) {
    await db().from('connections').update({ status: 'needs_reauth', last_error: String(e) }).eq('user_id', userId).eq('provider', 'microsoft');
    throw new Error('La sesión de Microsoft venció. Volvé a iniciar sesión.');
  }
}

export async function graph<T = any>(userId: string, path: string, headers: Record<string, string> = {}): Promise<T> {
  const token = await msToken(userId);
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...headers }, cache: 'no-store' });
  if (!r.ok) {
    const body = await r.text();
    const hint = r.status === 403 ? ' Puede faltar un permiso o la aprobación del administrador.' : '';
    throw new Error(`Microsoft Graph ${r.status} en ${path.split('?')[0]}.${hint} ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}
