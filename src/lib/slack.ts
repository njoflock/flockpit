import { env } from './env';
import { db, must } from './db';
import { encrypt, decrypt } from './crypto';

export const SLACK_USER_SCOPES = ['search:read', 'channels:history', 'groups:history', 'im:history', 'mpim:history', 'channels:read', 'groups:read', 'im:read', 'mpim:read', 'users:read'];
export const slackRedirect = () => `${env.appUrl()}/api/connect/slack/callback`;

export function slackAuthorizeUrl(state: string) {
  const p = new URLSearchParams({ client_id: env.slackClientId(), user_scope: SLACK_USER_SCOPES.join(','), redirect_uri: slackRedirect(), state });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

export async function slackExchange(code: string) {
  const r = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.slackClientId(), client_secret: env.slackClientSecret(), code, redirect_uri: slackRedirect() }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Slack rechazó la conexión: ${j.error}`);
  return { token: j.authed_user.access_token as string, userId: j.authed_user.id as string, teamId: j.team?.id as string, scopes: j.authed_user.scope as string };
}

export async function saveSlackConnection(uid: string, s: { token: string; userId: string; teamId: string; scopes: string }) {
  await must(db().from('connections').upsert({
    user_id: uid, provider: 'slack', external_user_id: s.userId, team_id: s.teamId, scopes: s.scopes,
    access_token_enc: encrypt(s.token), status: 'ok', last_error: null, updated_at: new Date().toISOString(),
  }));
}

export async function slackConn(uid: string) {
  const c = await must(db().from('connections').select('*').eq('user_id', uid).eq('provider', 'slack').maybeSingle());
  if (!c) return null;
  const row = c as { access_token_enc: string; external_user_id: string; team_id: string };
  return { token: decrypt(row.access_token_enc), slackUserId: row.external_user_id, teamId: row.team_id };
}

export async function slack<T = any>(token: string, method: string, params: Record<string, string | number> = {}): Promise<T> {
  const r = await fetch(`https://slack.com/api/${method}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`);
  return j as T;
}

const userCache = new Map<string, string>();
export async function slackUserName(token: string, id: string): Promise<string> {
  if (!id) return 'Desconocido';
  if (userCache.has(id)) return userCache.get(id)!;
  try {
    const j = await slack<{ user: { real_name?: string; name: string; profile?: { display_name?: string } } }>(token, 'users.info', { user: id });
    const n = j.user.real_name || j.user.profile?.display_name || j.user.name;
    userCache.set(id, n);
    return n;
  } catch {
    return id;
  }
}
// Convierte el formato de Slack (<@U123|Nombre>, <url|texto>, :emoji:) en texto legible
export function slackText(s: string): string {
  return String(s || '')
    .replace(/<@([A-Z0-9]+)\|([^>]+)>/g, '@$2')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/:[a-z0-9_+\-]+:/g, '')
    .trim();
}
