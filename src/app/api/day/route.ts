export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';

// Todo lo que muestra «Mi día» en una sola consulta.
export async function GET() {
  return handle(async () => {
    const s = await requireUser(), uid = s.uid, d = db();
    const since = new Date(Date.now() - 8 * 864e5).toISOString(), until = new Date(Date.now() + 8 * 864e5).toISOString();
    const [mail, events, convs, tasks, proposals, reviews, sync, conns, topics] = await Promise.all([
      must(d.from('mail_items').select('*').eq('user_id', uid).order('received_at', { ascending: false }).limit(200)),
      must(d.from('events').select('*').eq('user_id', uid).gte('start_at', since).lte('start_at', until).order('start_at')),
      must(d.from('conversations').select('*').eq('user_id', uid).order('last_at', { ascending: false }).limit(150)),
      must(d.from('tasks').select('*').eq('user_id', uid).neq('status', 'completada').order('due', { ascending: true, nullsFirst: false })),
      must(d.from('proposals').select('*').eq('user_id', uid).eq('status', 'open').order('created_at', { ascending: false })),
      must(d.from('reviews').select('*').eq('user_id', uid)),
      must(d.from('sync_state').select('*').eq('user_id', uid)),
      must(d.from('connections').select('provider,status,last_error,updated_at').eq('user_id', uid)),
      // Si la tabla todavía no existe, se devuelve una lista vacía en lugar de fallar.
      d.from('person_topics').select('*').eq('user_id', uid).order('created_at').then((r) => r.data || []),
    ]);
    return NextResponse.json({ me: s, demo: !!s.demo, ai: !!process.env.ANTHROPIC_API_KEY, topics, mail, events, convs, tasks, proposals, reviews, sync, conns });
  });
}
