import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { graph } from '@/lib/microsoft';

// Cuerpo completo del correo y los demás mensajes del mismo hilo.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser();
    const m = await graph<any>(s.uid, `/me/messages/${encodeURIComponent(params.id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,webLink,conversationId,isRead`, { Prefer: 'outlook.body-content-type="text"' });
    let thread: any[] = [];
    try {
      const t = await graph<{ value: any[] }>(s.uid, `/me/messages?$filter=conversationId eq '${String(m.conversationId).replace(/'/g, "''")}'&$select=id,subject,from,receivedDateTime,bodyPreview,webLink&$top=25`);
      thread = t.value.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
    } catch { /* el hilo es opcional */ }
    return NextResponse.json({ message: m, thread });
  });
}
