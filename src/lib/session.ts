import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from './env';

const COOKIE = 'flockpit_session';
const secret = () => new TextEncoder().encode(env.sessionSecret());

export type Session = { uid: string; email: string; name: string };

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, secure: env.appUrl().startsWith('https'), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function getSession(): Promise<Session | null> {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return { uid: String(payload.uid), email: String(payload.email), name: String(payload.name) };
  } catch {
    return null;
  }
}
export function clearSession() {
  cookies().delete(COOKIE);
}
// Estado anti-CSRF para los flujos OAuth
export function setOAuthState(name: string, value: string) {
  cookies().set(name, value, { httpOnly: true, secure: env.appUrl().startsWith('https'), sameSite: 'lax', path: '/', maxAge: 600 });
}
export function takeOAuthState(name: string): string | undefined {
  const v = cookies().get(name)?.value;
  cookies().delete(name);
  return v;
}
