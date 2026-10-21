import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { handle, requireUser } from '@/lib/http';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
export const maxDuration = 60;

const norm = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(['que', 'quedo', 'con', 'sobre', 'del', 'las', 'los', 'una', 'para', 'por', 'como', 'cuando', 'donde', 'esta', 'este', 'esto', 'tengo', 'hay', 'mis', 'algo', 'cual', 'cuales', 'quien']);
type Src = { type: string; id: string; title: string; sub: string; date: string | null; link: string | null; text: string };

// «Preguntale a Flockpit»: busca en tus datos y, si hay clave de Claude, arma una respuesta con fuentes.
export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireUser(), { q } = await req.json();
    const terms = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    const d = db(), uid = s.uid;
    const [mail, convs, tasks, props, events] = await Promise.all([
      d.from('mail_items').select('id,subject,from_name,received_at,preview,web_link').eq('user_id', uid).order('received_at', { ascending: false }).limit(300).then((r) => r.data || []),
      d.from('conversations').select('key,title,platform,last_author,last_text,last_at,link').eq('user_id', uid).order('last_at', { ascending: false }).limit(200).then((r) => r.data || []),
      d.from('tasks').select('id,description,project,owner,due,status,note').eq('user_id', uid).then((r) => r.data || []),
      d.from('proposals').select('id,action,project,owner,reason,status').eq('user_id', uid).eq('status', 'open').then((r) => r.data || []),
      d.from('events').select('id,title,start_at,organizer').eq('user_id', uid).then((r) => r.data || []),
    ]);
    const all: Src[] = [
      ...mail.map((m: any) => ({ type: 'mail', id: m.id, title: m.subject, sub: `Correo de ${m.from_name}`, date: m.received_at, link: m.web_link, text: `${m.subject} ${m.from_name} ${m.preview}` })),
      ...convs.map((c: any) => ({ type: 'conv', id: c.key, title: c.title, sub: `${c.platform === 'slack' ? 'Slack' : 'Teams'} · ${c.last_author}`, date: c.last_at, link: c.link, text: `${c.title} ${c.last_author} ${c.last_text}` })),
      ...tasks.map((t: any) => ({ type: 'task', id: t.id, title: t.description, sub: `Tarea · ${t.project} · ${t.owner}${t.status === 'completada' ? ' · completada' : ''}`, date: t.due, link: null, text: `${t.description} ${t.project} ${t.owner} ${t.note}` })),
      ...props.map((p: any) => ({ type: 'prop', id: p.id, title: p.action, sub: `Por confirmar · ${p.project || ''}`, date: null, link: null, text: `${p.action} ${p.project} ${p.owner} ${p.reason}` })),
      ...events.map((e: any) => ({ type: 'event', id: e.id, title: e.title, sub: 'Reunión', date: e.start_at, link: null, text: `${e.title} ${e.organizer}` })),
    ];
    const scored = all.map((x) => ({ x, score: terms.reduce((a, t) => a + (norm(x.text).includes(t) ? (norm(x.title).includes(t) ? 2 : 1) : 0), 0) }))
      .filter((r) => r.score > 0).sort((a, b) => b.score - a.score || String(b.x.date).localeCompare(String(a.x.date))).slice(0, 20).map((r) => r.x);
    if (!scored.length) return NextResponse.json({ answer: null, sources: [], note: 'No encontré nada relacionado en tus correos, mensajes, tareas ni reuniones.' });
    if (!env.anthropicKey()) return NextResponse.json({ answer: null, sources: scored.map(({ text, ...r }) => r), note: 'Resultados relacionados. Con ANTHROPIC_API_KEY, Flockpit además redacta una respuesta.' });
    const ctx = scored.map((x, i) => `[${i + 1}] ${x.sub} · ${x.date || ''}\n${x.text.slice(0, 600)}`).join('\n\n');
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const msg = await client.messages.create({
      model: env.anthropicModel(), max_tokens: 700,
      system: 'Respondé la pregunta de una Business Manager usando solo el contexto numerado. Español rioplatense, breve y concreto. Citá las fuentes con [n] al final de cada afirmación. Si el contexto no alcanza, decilo.',
      messages: [{ role: 'user', content: `Pregunta: ${q}\n\nContexto:\n${ctx}` }],
    });
    const answer = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    const used = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]) - 1));
    const sources = scored.map(({ text, ...r }, i) => ({ ...r, n: i + 1, cited: used.has(i) }));
    return NextResponse.json({ answer, sources });
  });
}
