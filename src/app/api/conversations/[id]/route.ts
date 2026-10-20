import { NextResponse } from 'next/server';
import { handle, requireUser, HttpError } from '@/lib/http';
import { graph } from '@/lib/microsoft';
import { slack, slackConn, slackText, slackUserName } from '@/lib/slack';

// Mensajes de una conversación (con respuestas del hilo) para leer dentro de Flockpit.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser(), key = decodeURIComponent(params.id);
    if (key.startsWith('teams:')) {
      const r = await graph<{ value: any[] }>(s.uid, `/me/chats/${encodeURIComponent(key.slice(6))}/messages?$top=40`);
      const msgs = r.value.filter((m) => m.messageType === 'message').map((m) => ({
        author: m.from?.user?.displayName || 'Desconocido', date: m.createdDateTime,
        text: String(m.body?.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() || '(adjunto)',
      })).sort((a, b) => a.date.localeCompare(b.date));
      return NextResponse.json({ messages: msgs });
    }
    if (key.startsWith('slack:')) {
      const conn = await slackConn(s.uid);
      if (!conn) throw new HttpError(400, 'Slack no está conectado.');
      const [, ch, ts] = key.split(':');
      const j = ts ? await slack<any>(conn.token, 'conversations.replies', { channel: ch, ts, limit: 50 })
                   : await slack<any>(conn.token, 'conversations.history', { channel: ch, limit: 25 });
      const msgs = [];
      for (const m of j.messages || []) msgs.push({ author: m.user === conn.slackUserId ? 'Vos' : m.username || (await slackUserName(conn.token, m.user)), date: new Date(Number(m.ts) * 1000).toISOString(), text: slackText(m.text) || '(adjunto)', reply: !!(ts && m.ts !== ts) });
      msgs.sort((a, b) => a.date.localeCompare(b.date));
      return NextResponse.json({ messages: msgs });
    }
    throw new HttpError(400, 'Conversación desconocida.');
  });
}
