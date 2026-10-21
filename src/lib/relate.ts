import type { Day, Ev, Mail, Conv, Task, Prop, Person } from './shared';
import { AUTO, isMine, dayKey } from './shared';

/* ---------- normalización ---------- */
export const norm = (s: string | null | undefined) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(['flock', 'interno', 'equipo', 'proyecto', 'cliente', 'sin', 'para', 'con', 'del', 'los', 'las', 'una', 'reunion', 'check', 'sync', 'semanal', 'revision', 'entrega', 'coordinacion']);
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
const DAY = 864e5;
const ago = (iso: string) => (Date.now() - Date.parse(iso)) / DAY;

/* ---------- clientes y proyectos ---------- */
export type Client = { name: string; kws: string[] };
const GENERIC = new Set(['sin proyecto', 'otro', '—', '']);

export function clients(day: Day): Client[] {
  const names = new Map<string, number>();
  const add = (n?: string | null) => { const k = (n || '').trim(); if (!GENERIC.has(k.toLowerCase())) names.set(k, (names.get(k) || 0) + 1); };
  day.tasks.forEach((t) => add(t.project));
  day.proposals.forEach((p) => add(p.project));
  return [...names.keys()].map((name) => ({ name, kws: words(name) })).filter((c) => c.kws.length).sort((a, b) => a.name.localeCompare(b.name));
}
const hit = (text: string, kws: string[]) => { const t = norm(text); return kws.some((k) => t.includes(k)); };
export const mailMatches = (m: Mail, c: Client) => hit(`${m.subject} ${m.preview} ${m.from_email.split('@')[1] || ''}`, c.kws);
export const convMatches = (x: Conv, c: Client) => hit(`${x.title} ${x.last_text}`, c.kws);
export const eventMatches = (e: Ev, c: Client) => hit(e.title, c.kws);
export function clientFor(day: Day, text: string): Client | null {
  return clients(day).find((c) => hit(text, c.kws)) || null;
}

export function clientData(day: Day, c: Client, me: string) {
  const tasks = day.tasks.filter((t) => t.project === c.name);
  const mine = tasks.filter((t) => isMine(t, me)), follow = tasks.filter((t) => !isMine(t, me));
  const proposals = day.proposals.filter((p) => p.project === c.name);
  const mails = day.mail.filter((m) => mailMatches(m, c) && !AUTO.test(m.from_email)).slice(0, 20);
  const convs = day.convs.filter((x) => convMatches(x, c)).slice(0, 20);
  const now = Date.now();
  const events = day.events.filter((e) => !e.cancelled && eventMatches(e, c) && Date.parse(e.end_at) > now).slice(0, 6);
  const today = dayKey(new Date());
  const alerts: { text: string; level: 'alta' | 'media' }[] = [];
  mine.filter((t) => t.due && t.due < today).forEach((t) => alerts.push({ text: `Tarea vencida: ${t.description}`, level: 'alta' }));
  follow.filter((t) => t.due && t.due < today).forEach((t) => alerts.push({ text: `${t.owner} no cumplió a tiempo: ${t.description}`, level: 'alta' }));
  mails.filter((m) => m.needs_reply && ago(m.received_at) >= 2).forEach((m) => alerts.push({ text: `${m.from_name} espera respuesta hace ${Math.floor(ago(m.received_at))} días: ${m.subject}`, level: ago(m.received_at) >= 5 ? 'alta' : 'media' }));
  convs.filter((x) => x.needs_reply && x.last_author !== 'Vos' && ago(x.last_at) >= 1).forEach((x) => alerts.push({ text: `${x.last_author} espera respuesta en ${x.title} hace ${Math.max(1, Math.floor(ago(x.last_at)))} días`, level: 'media' }));
  const last = [...mails.map((m) => m.received_at), ...convs.map((x) => x.last_at)].sort().reverse()[0] || null;
  const health: 'ok' | 'atencion' | 'riesgo' = alerts.some((a) => a.level === 'alta') ? 'riesgo' : alerts.length ? 'atencion' : 'ok';
  return { tasks, mine, follow, proposals, mails, convs, events, alerts, last, health };
}

/* ---------- personas ---------- */
export type PersonRow = { name: string; email?: string | null; score: number };
const isMe = (n: string, me: string, email?: string) => {
  const a = norm(n), m = norm(me);
  return !a || a === 'vos' || a === 'yo' || a === m || a === m.split(' ')[0] || (!!email && norm(email) === norm(n));
};
export function people(day: Day, me: string, meEmail: string): PersonRow[] {
  const map = new Map<string, PersonRow>();
  const add = (name: string | null | undefined, email: string | null | undefined, w: number) => {
    const n = (name || '').trim();
    if (!n || isMe(n, me, meEmail) || /^#|desconocido|mensaje directo|chat de teams/i.test(n) || n.includes(',') || (email && AUTO.test(email))) return;
    const k = norm(n);
    const cur = map.get(k) || { name: n, email: email || null, score: 0 };
    cur.score += w; if (!cur.email && email) cur.email = email;
    map.set(k, cur);
  };
  day.tasks.filter((t) => !isMine(t, me)).forEach((t) => add(t.owner, null, 3));
  day.convs.forEach((c) => { add(c.last_author, null, 1); if (c.kind === 'dm') add(c.title, null, 2); });
  day.mail.filter((m) => ago(m.received_at) < 14).forEach((m) => add(m.from_name, m.from_email, 1));
  day.events.forEach((e) => (e.attendees || []).forEach((a) => add(a.name, a.email, 1)));
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 40);
}
const first = (n: string) => norm(n).split(' ')[0];
const mentions = (text: string, p: PersonRow) => { const t = norm(text); const f = first(p.name); return t.includes(norm(p.name)) || (f.length >= 3 && new RegExp(`\\b${f}\\b`).test(t)); };
const attends = (e: Ev, p: PersonRow) => (e.attendees || []).some((a) => (p.email && norm(a.email) === norm(p.email)) || norm(a.name) === norm(p.name));

export function personData(day: Day, p: PersonRow, me: string) {
  const now = Date.now();
  const theirs = day.tasks.filter((t) => norm(t.owner) === norm(p.name));
  const mineAbout = day.tasks.filter((t) => isMine(t, me) && mentions(`${t.description} ${t.note}`, p));
  const proposals = day.proposals.filter((x) => norm(x.owner) === norm(p.name) || mentions(x.action, p));
  const convs = day.convs.filter((c) => norm(c.last_author) === norm(p.name) || (c.kind === 'dm' && norm(c.title) === norm(p.name)) || mentions(c.last_text, p)).slice(0, 10);
  const mails = day.mail.filter((m) => norm(m.from_name) === norm(p.name) || (p.email && norm(m.from_email) === norm(p.email))).slice(0, 10);
  const meetings = day.events.filter((e) => !e.cancelled && Date.parse(e.end_at) > now && (attends(e, p) || mentions(e.title, p)));
  const oneOnOne = meetings.find((e) => (e.attendees || []).length <= 2 || mentions(e.title, p)) || null;
  const absences = day.tasks.filter((t) => /vacacion|licencia|ausencia|permiso/i.test(t.description) && mentions(t.description, p));
  const auto: { text: string; kind: string; ref?: { type: string; id: string } }[] = [];
  theirs.forEach((t) => auto.push({ text: `${t.due && t.due < dayKey(new Date()) ? 'Vencido: ' : ''}${t.description}`, kind: 'Compromiso suyo', ref: { type: 'task', id: t.id } }));
  mineAbout.forEach((t) => auto.push({ text: t.description, kind: 'Tarea tuya', ref: { type: 'task', id: t.id } }));
  convs.filter((c) => c.needs_reply && c.last_author !== 'Vos').forEach((c) => auto.push({ text: c.short_title || c.last_text, kind: 'Espera tu respuesta', ref: { type: 'conv', id: c.key } }));
  mails.filter((m) => m.needs_reply).forEach((m) => auto.push({ text: m.short_title || m.subject, kind: 'Correo por responder', ref: { type: 'mail', id: m.id } }));
  proposals.forEach((x) => auto.push({ text: x.action, kind: 'Por confirmar', ref: { type: 'prop', id: x.id } }));
  return { theirs, mineAbout, proposals, convs, mails, meetings, oneOnOne, absences, auto };
}

/* ---------- preparación de reuniones ---------- */
export function meetingPrep(day: Day, e: Ev, me: string, meEmail: string) {
  const all = people(day, me, meEmail);
  const att = (e.attendees || []).filter((a) => !isMe(a.name, me, meEmail) && !(a.email && norm(a.email) === norm(meEmail)));
  const participants = att.map((a) => all.find((p) => norm(p.name) === norm(a.name) || (a.email && norm(p.email) === norm(a.email))) || { name: a.name, email: a.email, score: 0 });
  const client = clientFor(day, e.title);
  const cd = client ? clientData(day, client, me) : null;
  const perPerson = participants.map((p) => ({ p, d: personData(day, p, me) }));
  const theirCommitments = perPerson.flatMap(({ p, d }) => d.theirs.map((t) => ({ who: p.name, t })));
  const myCommitments = [...new Map([...(cd?.mine || []), ...perPerson.flatMap(({ d }) => d.mineAbout)].map((t) => [t.id, t])).values()];
  const proposals = [...new Map([...(cd?.proposals || []), ...perPerson.flatMap(({ d }) => d.proposals)].map((x) => [x.id, x])).values()];
  const since = Date.now() - 14 * DAY;
  const convs = [...new Map([...(cd?.convs || []), ...perPerson.flatMap(({ d }) => d.convs)].map((c) => [c.key, c])).values()].filter((c) => Date.parse(c.last_at) > since).slice(0, 6);
  const mails = [...new Map([...(cd?.mails || []), ...perPerson.flatMap(({ d }) => d.mails)].map((m) => [m.id, m])).values()].filter((m) => Date.parse(m.received_at) > since).slice(0, 6);
  const topics = (Array.isArray(day.topics) ? day.topics : []).filter((t) => !t.done && participants.some((p) => norm(p.name) === norm(t.person)));
  return { participants, client, alerts: cd?.alerts || [], theirCommitments, myCommitments, proposals, convs, mails, topics };
}
export function prepAsText(e: Ev, prep: ReturnType<typeof meetingPrep>) {
  const L: string[] = [`Reunión: ${e.title}`, `Participantes: ${prep.participants.map((p) => p.name).join(', ') || 'sin datos'}`];
  if (prep.client) L.push(`Cliente o proyecto: ${prep.client.name}`);
  prep.alerts.forEach((a) => L.push(`Alerta: ${a.text}`));
  prep.myCommitments.forEach((t) => L.push(`Compromiso propio: ${t.description}${t.due ? ` (plazo ${t.due})` : ''}`));
  prep.theirCommitments.forEach(({ who, t }) => L.push(`Compromiso de ${who}: ${t.description}${t.due ? ` (plazo ${t.due})` : ''}`));
  prep.convs.forEach((c) => L.push(`Conversación ${c.title} (${c.last_author}): ${c.last_text}`));
  prep.mails.forEach((m) => L.push(`Correo de ${m.from_name}: ${m.subject} — ${m.preview}`));
  prep.topics.forEach((t) => L.push(`Tema anotado para ${t.person}: ${t.text}`));
  return L.join('\n');
}
export type { Task, Prop, Conv, Mail, Ev, Person };

/* ---------- resumen de inicio del día ---------- */
export function dailyBrief(day: Day, me: string, meEmail: string, lastSeen: number) {
  const today = dayKey(new Date()), now = Date.now();
  const mine = day.tasks.filter((t) => isMine(t, me));
  const dueToday = mine.filter((t) => t.due === today);
  const overdue = mine.filter((t) => t.due && t.due < today);
  const lateOthers = day.tasks.filter((t) => !isMine(t, me) && t.due && t.due < today);
  const waitingMail = day.mail.filter((m) => m.needs_reply);
  const waitingConv = day.convs.filter((c) => c.needs_reply && c.last_author !== 'Vos');
  const waitingPeople = [...new Set([...waitingMail.map((m) => m.from_name), ...waitingConv.map((c) => (c.kind === 'dm' ? c.title : c.last_author))])];
  const newMail = lastSeen ? day.mail.filter((m) => Date.parse(m.received_at) > lastSeen && !AUTO.test(m.from_email)) : [];
  const newConv = lastSeen ? day.convs.filter((c) => Date.parse(c.last_at) > lastSeen && c.last_author !== 'Vos') : [];
  const newProps = lastSeen ? day.proposals.filter((p: any) => p.created_at && Date.parse(p.created_at) > lastSeen) : [];
  const meetingsToday = day.events.filter((e) => !e.cancelled && !e.all_day && dayKey(new Date(e.start_at)) === today);
  const next = meetingsToday.find((e) => Date.parse(e.end_at) > now) || null;
  const risk = clients(day).map((c) => ({ c, d: clientData(day, c, me) })).filter((x) => x.d.health === 'riesgo').map((x) => x.c.name);
  return { dueToday, overdue, lateOthers, waitingMail, waitingConv, waitingPeople, newMail, newConv, newProps, meetingsToday, next, risk };
}
export function briefAsText(b: ReturnType<typeof dailyBrief>) {
  const L: string[] = [];
  if (b.newMail.length || b.newConv.length) L.push(`Desde tu última visita: ${b.newMail.length} correos y ${b.newConv.length} mensajes nuevos.`);
  b.overdue.forEach((t) => L.push(`Tarea vencida: ${t.description} (${t.project})`));
  b.dueToday.forEach((t) => L.push(`Vence hoy: ${t.description} (${t.project})`));
  b.waitingMail.forEach((m) => L.push(`Correo por responder de ${m.from_name}: ${m.subject}`));
  b.waitingConv.forEach((c) => L.push(`Mensaje por responder en ${c.title} (${c.last_author}): ${c.last_text}`));
  b.lateOthers.forEach((t) => L.push(`${t.owner} tiene atrasado: ${t.description} (plazo ${t.due})`));
  b.meetingsToday.forEach((e) => L.push(`Reunión hoy: ${e.title}`));
  b.risk.forEach((c) => L.push(`Cliente en riesgo: ${c}`));
  return L.join('\n');
}

/* ---------- borrador de seguimiento sin IA ---------- */
export function followUpTemplate(t: Task) {
  const first = (t.owner || '').split(' ')[0] || 'Hola';
  const when = t.due ? ` Habíamos quedado para el ${t.due.split('-').reverse().slice(0, 2).join('/')}.` : '';
  return `Hola ${first}, ¿cómo venís con «${t.description}»?${when} Si necesitás algo de mi lado para avanzar, avisame. ¡Gracias!`;
}
