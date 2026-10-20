import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    if (!b.description?.trim()) return NextResponse.json({ error: 'La tarea necesita una acción.' }, { status: 400 });
    const row = await must(db().from('tasks').insert({
      user_id: s.uid, description: b.description.trim(), project: b.project || 'Sin proyecto', owner: b.owner || 'Yo',
      due: b.due || null, priority: b.priority || 'media', note: b.note || '', source_key: b.source_key || null, sources: b.sources || [],
    }).select('*').single());
    return NextResponse.json(row);
  });
}
