import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';

// body: { action: 'confirm' | 'dismiss' | 'restore', edits?: {...} }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json(), d = db();
    const p = (await must(d.from('proposals').select('*').eq('id', params.id).eq('user_id', s.uid).single())) as any;
    if (b.action === 'dismiss') { await must(d.from('proposals').update({ status: 'dismissed' }).eq('id', p.id)); return NextResponse.json({ ok: true }); }
    if (b.action === 'restore') { await must(d.from('proposals').update({ status: 'open', task_id: null }).eq('id', p.id)); return NextResponse.json({ ok: true }); }
    const e = b.edits || {};
    const task = (await must(d.from('tasks').insert({
      user_id: s.uid, description: e.action || p.action, project: e.project ?? p.project ?? 'Sin proyecto', owner: e.owner ?? p.owner ?? 'Por confirmar',
      due: e.due ?? p.due, priority: e.priority ?? p.priority, source_key: p.key, sources: p.sources,
    }).select('*').single())) as any;
    await must(d.from('proposals').update({ status: 'confirmed', task_id: task.id }).eq('id', p.id));
    return NextResponse.json(task);
  });
}
