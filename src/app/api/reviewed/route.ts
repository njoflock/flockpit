import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';
// «Revisado en Flockpit»: no cambia el estado de lectura en Outlook, Teams ni Slack.
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    if (b.undo) await must(db().from('reviews').delete().eq('user_id', s.uid).eq('item_key', b.key));
    else await must(db().from('reviews').upsert({ user_id: s.uid, item_key: b.key, last_id: b.last_id || null, reviewed_at: new Date().toISOString() }));
    return NextResponse.json({ ok: true });
  });
}
