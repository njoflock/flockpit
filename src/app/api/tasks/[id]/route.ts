import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';

const EDITABLE = ['description', 'project', 'owner', 'due', 'priority', 'status', 'note'];
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of EDITABLE) if (k in b) patch[k] = b[k] === '' && k === 'due' ? null : b[k];
    if (b.status === 'completada') patch.done_at = new Date().toISOString();
    if (b.status && b.status !== 'completada') patch.done_at = null;
    const row = await must(db().from('tasks').update(patch).eq('id', params.id).eq('user_id', s.uid).select('*').single());
    return NextResponse.json(row);
  });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser();
    await must(db().from('tasks').delete().eq('id', params.id).eq('user_id', s.uid));
    return NextResponse.json({ ok: true });
  });
}
