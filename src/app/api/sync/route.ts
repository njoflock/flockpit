import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { syncUser } from '@/lib/sync';
export const maxDuration = 60;
// Actualización manual (botón «Actualizar») y automática mientras la app está abierta.
export async function POST() { return handle(async () => { const s = await requireUser(); return NextResponse.json(await syncUser(s.uid)); }); }
