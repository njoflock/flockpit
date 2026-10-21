import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';
// Temas anotados para hablar con una persona.
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    if (!b.person || !b.text?.trim()) return NextResponse.json({ error: 'Falta la persona o el tema.' }, { status: 400 });
    return NextResponse.json(await must(db().from('person_topics').insert({ user_id: s.uid, person: b.person, text: b.text.trim() }).select('*').single()));
  });
}
