import { NextResponse } from 'next/server';
import { getSession, Session } from './session';

export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Iniciá sesión para continuar.');
  return s;
}
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : 'Error inesperado';
    if (status >= 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  });
}
