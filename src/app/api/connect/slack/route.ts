export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { slackAuthorizeUrl } from '@/lib/slack';
import { getSession, setOAuthState } from '@/lib/session';
import { env } from '@/lib/env';

// Abre la pantalla de permisos de Slack.
export async function GET() {
  if (!(await getSession())) return NextResponse.redirect(`${env.appUrl()}/login`);
  const state = randomBytes(16).toString('hex');
  setOAuthState('slack_state', state);
  return NextResponse.redirect(slackAuthorizeUrl(state));
}
