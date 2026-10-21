import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    return NextResponse.json(await must(db().from('person_topics').update({ done: !!b.done }).eq('id', params.id).eq('user_id', s.uid).select('*').single()));
  });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireUser();
    await must(db().from('person_topics').delete().eq('id', params.id).eq('user_id', s.uid));
    return NextResponse.json({ ok: true });
  });
}
