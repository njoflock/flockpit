import { NextRequest, NextResponse } from 'next/server';
import { slackExchange, saveSlackConnection } from '@/lib/slack';
import { getSession, takeOAuthState } from '@/lib/session';
import { syncUser } from '@/lib/sync';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const s = await getSession();
  const back = (q: string) => NextResponse.redirect(`${env.appUrl()}/ajustes?${q}`);
  if (!s) return NextResponse.redirect(`${env.appUrl()}/login`);
  const u = req.nextUrl;
  if (u.searchParams.get('error')) return back(`error=${encodeURIComponent('Slack no autorizó la conexión: ' + u.searchParams.get('error'))}`);
  const state = takeOAuthState('slack_state');
  if (!state || state !== u.searchParams.get('state')) return back(`error=${encodeURIComponent('La conexión expiró. Probá de nuevo.')}`);
  try {
    await saveSlackConnection(s.uid, await slackExchange(u.searchParams.get('code') || ''));
    await syncUser(s.uid, ['slack']);
    return back('ok=slack');
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : 'No se pudo conectar Slack.')}`);
  }
}
