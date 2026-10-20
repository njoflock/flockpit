import Anthropic from '@anthropic-ai/sdk';
import { db, must } from './db';
import { env } from './env';

const AUTO = /no-?reply|noreply|newsletter|notification|mailer|marketing|billing/i;

type Verdict = {
  id: string; needs_reply: boolean; attention: 'reply' | 'review' | null; reason: string; short_title: string;
  task?: { action: string; project?: string; owner?: string; due?: string | null; priority?: 'alta' | 'media' | 'baja'; reason?: string; kind?: string } | null;
};

const SYSTEM = `Sos el asistente de una Business Manager. Recibís correos y conversaciones de trabajo recientes.
Para cada elemento devolvé si podría requerir su respuesta o una decisión, el motivo en una frase, un título breve
(máximo 8 palabras, empezando con un verbo) y, solo si hay un pedido o compromiso concreto, una propuesta de tarea.
No inventes responsables ni fechas: si no están explícitos, dejalos vacíos. Los correos informativos, newsletters,
promociones y notificaciones automáticas no requieren respuesta ni generan tareas.
Respondé únicamente con un array JSON de objetos {id, needs_reply, attention ("reply"|"review"|null), reason, short_title, task}.
task es null o {action, project, owner, due (YYYY-MM-DD o null), priority ("alta"|"media"|"baja"), reason, kind ("pedido"|"compromiso"|"aprobacion"|"seguimiento"|"respuesta")}.`;

export async function analyzeUser(uid: string) {
  if (!env.anthropicKey()) return { ok: true, skipped: 'Sin ANTHROPIC_API_KEY: no se clasifica automáticamente.' };
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const mails = (await must(db().from('mail_items').select('id,subject,from_name,from_email,received_at,preview,web_link')
    .eq('user_id', uid).is('analyzed_at', null).gte('received_at', since).order('received_at', { ascending: false }).limit(25))) as any[];
  const convsAll = (await must(db().from('conversations').select('key,platform,title,last_id,last_author,last_text,last_at,link,mention,thread,analyzed_last_id')
    .eq('user_id', uid).gte('last_at', since).order('last_at', { ascending: false }).limit(60))) as any[];
  const convs = convsAll.filter((c) => c.last_id !== c.analyzed_last_id).slice(0, 20);
  const autoMails = mails.filter((m) => AUTO.test(m.from_email));
  const humanMails = mails.filter((m) => !AUTO.test(m.from_email));
  // Las notificaciones automáticas se marcan sin gastar análisis.
  for (const m of autoMails) await db().from('mail_items').update({ needs_reply: false, attention: null, reason: 'Notificación automática.', analyzed_at: new Date().toISOString() }).eq('user_id', uid).eq('id', m.id);
  if (!humanMails.length && !convs.length) return { ok: true, analyzed: 0 };

  const items = [
    ...humanMails.map((m) => ({ id: `mail:${m.id}`, tipo: 'correo', de: `${m.from_name} <${m.from_email}>`, fecha: m.received_at, asunto: m.subject, contenido: m.preview })),
    ...convs.map((c) => ({ id: `conv:${c.key}`, tipo: c.platform, conversacion: c.title, ultimo_autor: c.last_author, fecha: c.last_at, mencion: c.mention, hilo: c.thread, mensaje: c.last_text })),
  ];
  const client = new Anthropic({ apiKey: env.anthropicKey() });
  const msg = await client.messages.create({
    model: env.anthropicModel(), max_tokens: 4000, system: SYSTEM,
    messages: [{ role: 'user', content: `Fecha actual: ${new Date().toISOString()}\nElementos:\n${JSON.stringify(items)}` }],
  });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  let verdicts: Verdict[] = [];
  try { verdicts = JSON.parse(json); } catch { throw new Error('La respuesta del análisis no fue JSON válido.'); }

  const now = new Date().toISOString();
  let proposals = 0;
  for (const v of verdicts) {
    if (v.id.startsWith('mail:')) {
      const id = v.id.slice(5), m = humanMails.find((x) => x.id === id);
      if (!m) continue;
      await db().from('mail_items').update({ needs_reply: v.needs_reply, attention: v.attention, reason: v.reason, short_title: v.short_title, analyzed_at: now }).eq('user_id', uid).eq('id', id);
      if (v.task) proposals += await propose(uid, `mail:${id}`, v.task, [{ kind: 'email', subject: m.subject, from: m.from_name, date: m.received_at, snippet: m.preview.slice(0, 200), link: m.web_link }]);
    } else if (v.id.startsWith('conv:')) {
      const key = v.id.slice(5), c = convs.find((x) => x.key === key);
      if (!c) continue;
      await db().from('conversations').update({ needs_reply: v.needs_reply, reason: v.reason, short_title: v.short_title, analyzed_last_id: c.last_id }).eq('user_id', uid).eq('key', key);
      if (v.task) proposals += await propose(uid, `conv:${key}:${c.last_id}`, v.task, [{ kind: 'message', platform: c.platform, subject: c.title, from: c.last_author, date: c.last_at, snippet: c.last_text.slice(0, 200), link: c.link }]);
    }
  }
  return { ok: true, analyzed: verdicts.length, proposals };
}

// Crea la propuesta solo si no existe (las descartadas o confirmadas no vuelven a aparecer).
async function propose(uid: string, key: string, t: NonNullable<Verdict['task']>, sources: unknown[]) {
  const { data } = await db().from('proposals').select('id').eq('user_id', uid).eq('key', key).maybeSingle();
  if (data) return 0;
  await must(db().from('proposals').insert({
    user_id: uid, key, action: t.action, project: t.project || null, owner: t.owner || null,
    due: t.due && /^\d{4}-\d\d-\d\d$/.test(t.due) ? t.due : null, priority: t.priority || 'media', reason: t.reason || null, kind: t.kind || 'pedido', sources,
  }));
  return 1;
}
