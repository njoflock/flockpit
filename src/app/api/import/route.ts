import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/http';
import { db, must } from '@/lib/db';

// Importa tareas y propuestas exportadas del Flockpit que usabas dentro de Claude.
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireUser(), b = await req.json();
    let tasks = 0, proposals = 0;
    for (const t of b.tasks || []) {
      const key = t.source_key || `import:${t.id}`;
      const { data } = await db().from('tasks').select('id').eq('user_id', s.uid).eq('source_key', key).maybeSingle();
      if (data) continue;
      await must(db().from('tasks').insert({ user_id: s.uid, description: t.description, project: t.project, owner: t.owner, due: t.due, priority: t.priority, status: t.status, note: t.note || '', source_key: key, sources: t.sources || [], event_at: t.event_at || null }));
      tasks++;
    }
    for (const p of b.proposals || []) {
      const { data } = await db().from('proposals').select('id').eq('user_id', s.uid).eq('key', p.key).maybeSingle();
      if (data) continue;
      await must(db().from('proposals').insert({ user_id: s.uid, key: p.key, action: p.action, project: p.project, owner: p.owner, due: p.due, priority: p.priority, reason: p.reason, kind: p.kind, sources: p.sources || [], status: p.status || 'open' }));
      proposals++;
    }
    return NextResponse.json({ tasks, proposals });
  });
}
