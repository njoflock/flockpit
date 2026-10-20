export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { graph } from '@/lib/microsoft';
import { demoMailBody } from '@/lib/demo';

// Cuerpo completo del correo y los demás mensajes del mismo hilo.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser();
    if (s.demo) return NextResponse.json({ message: { body: { content: demoMailBody(params.id) } }, thread: [] });
    const m = await graph<any>(s.uid, `/me/messages/${encodeURIComponent(params.id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,webLink,conversationId,isRead`, { Prefer: 'outlook.body-content-type="text"' });
    let thread: any[] = [];
    try {
      const t = await graph<{ value: any[] }>(s.uid, `/me/messages?$filter=conversationId eq '${String(m.conversationId).replace(/'/g, "''")}'&$select=id,subject,from,receivedDateTime,bodyPreview,webLink&$top=25`);
      thread = t.value.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
    } catch { /* el hilo es opcional */ }
    return NextResponse.json({ message: m, thread });
  });
}
