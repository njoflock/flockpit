'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Day, Ev } from '@/lib/shared';
import { api, avStyle, cap, dueInfo, fmt, hhmm, initials, when } from '@/lib/shared';
import { clients, clientData, people, personData, meetingPrep, prepAsText, dailyBrief, briefAsText, followUpTemplate, type PersonRow } from '@/lib/relate';
import type { Task } from '@/lib/shared';

type Open = (type: string, id: string) => void;
const HEALTH = { ok: { l: 'Al día', c: 'h-ok' }, atencion: { l: 'Requiere atención', c: 'h-warn' }, riesgo: { l: 'En riesgo', c: 'h-bad' } } as const;
const meetingLabel = (e: Ev) => `${cap(fmt(new Date(e.start_at), { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''))} · ${hhmm(e.start_at)}`;

function Item({ title, sub, right, onClick }: { title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <button className="v-item" onClick={onClick} disabled={!onClick}>
      <span className="v-item-b"><b>{title}</b>{sub && <span>{sub}</span>}</span>{right}
    </button>
  );
}
function Section({ title, count, children, empty }: { title: string; count?: number; children: React.ReactNode; empty?: string }) {
  const has = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : !!children;
  return (
    <section className="v-sec">
      <h3>{title}{count !== undefined && <span className="cnt6">{count}</span>}</h3>
      {has ? children : <p className="muted v-empty">{empty || 'Nada por ahora.'}</p>}
    </section>
  );
}

/* ================= Clientes y proyectos ================= */
export function ClientsView({ day, me, open }: { day: Day; me: string; open: Open }) {
  const list = useMemo(() => clients(day).map((c) => ({ c, d: clientData(day, c, me) })).sort((a, b) => ['riesgo', 'atencion', 'ok'].indexOf(a.d.health) - ['riesgo', 'atencion', 'ok'].indexOf(b.d.health)), [day, me]);
  const [sel, setSel] = useState<string>('');
  const cur = list.find((x) => x.c.name === sel) || list[0];
  if (!list.length) return <div className="v-empty-page"><h2>Clientes y proyectos</h2><p className="muted">Todavía no hay proyectos. Aparecen cuando una tarea o propuesta tiene un proyecto asignado.</p></div>;
  const d = cur.d;
  return (
    <div className="v-split">
      <aside className="v-list">
        <h2>Clientes y proyectos</h2>
        {list.map(({ c, d }) => (
          <button key={c.name} className={`v-row ${cur.c.name === c.name ? 'sel' : ''}`} onClick={() => setSel(c.name)}>
            <span className="av6" style={avStyle(c.name)}>{initials(c.name)}</span>
            <span className="v-row-b"><b>{c.name}</b><span>{d.mine.length + d.follow.length} abiertas · {d.proposals.length} por confirmar</span></span>
            <span className={`hp ${HEALTH[d.health].c}`} title={HEALTH[d.health].l} />
          </button>
        ))}
      </aside>
      <div className="v-detail">
        <header className="v-head">
          <span className="av6 lg" style={avStyle(cur.c.name)}>{initials(cur.c.name)}</span>
          <div><h2>{cur.c.name}</h2><p className="muted">Último movimiento: {when(d.last)} · <span className={`hl ${HEALTH[d.health].c}`}>{HEALTH[d.health].l}</span></p></div>
        </header>
        {d.alerts.length > 0 && <div className="v-alerts">{d.alerts.map((a, i) => <div key={i} className={`v-alert ${a.level}`}>{a.text}</div>)}</div>}
        <div className="v-grid">
          <Section title="Tus tareas" count={d.mine.length} empty="No tenés tareas abiertas para este cliente.">
            {d.mine.map((t) => { const di = dueInfo(t.due); return <Item key={t.id} title={t.description} sub={t.status === 'en_curso' ? 'En curso' : undefined} right={<span className={`v-due ${di.cls}`}>{di.label}</span>} onClick={() => open('task', t.id)} />; })}
          </Section>
          <Section title="Compromisos de otras personas" count={d.follow.length} empty="No hay seguimientos abiertos.">
            {d.follow.map((t) => { const di = dueInfo(t.due); return <Item key={t.id} title={t.description} sub={`A cargo de ${t.owner}`} right={<span className={`v-due ${di.cls}`}>{di.label}</span>} onClick={() => open('task', t.id)} />; })}
          </Section>
          <Section title="Próximas reuniones" count={d.events.length} empty="No hay reuniones próximas con este cliente.">
            {d.events.map((e) => <Item key={e.id} title={e.title} sub={meetingLabel(e)} right={<span className="v-tag">Preparar</span>} onClick={() => open('event', e.id)} />)}
          </Section>
          <Section title="Por confirmar" count={d.proposals.length} empty="No hay propuestas pendientes.">
            {d.proposals.map((p) => <Item key={p.id} title={p.action} sub={p.reason || undefined} onClick={() => open('prop', p.id)} />)}
          </Section>
          <Section title="Conversaciones recientes" count={d.convs.length} empty="Sin conversaciones recientes.">
            {d.convs.slice(0, 6).map((c) => <Item key={c.key} title={`${c.title} · ${c.platform === 'slack' ? 'Slack' : 'Teams'}`} sub={`${c.last_author}: ${c.last_text}`} right={<span className="muted">{when(c.last_at)}</span>} onClick={() => open('conv', c.key)} />)}
          </Section>
          <Section title="Correos recientes" count={d.mails.length} empty="Sin correos recientes.">
            {d.mails.slice(0, 6).map((m) => <Item key={m.id} title={m.subject} sub={m.from_name} right={m.needs_reply ? <span className="f6 f-reply">Por responder</span> : <span className="muted">{when(m.received_at)}</span>} onClick={() => open('mail', m.id)} />)}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ================= Personas ================= */
export function PeopleView({ day, me, meEmail, open, reload }: { day: Day; me: string; meEmail: string; open: Open; reload: () => Promise<void> }) {
  const list = useMemo(() => people(day, me, meEmail).map((p) => ({ p, d: personData(day, p, me) })).sort((a, b) => b.d.auto.length - a.d.auto.length || b.p.score - a.p.score), [day, me, meEmail]);
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const shown = list.filter(({ p }) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const cur = list.find((x) => x.p.name === sel) || shown[0];
  if (!list.length) return <div className="v-empty-page"><h2>Personas</h2><p className="muted">Todavía no hay personas. Aparecen a partir de tus correos, chats, reuniones y seguimientos.</p></div>;
  const d = cur.d, topics = (Array.isArray(day.topics) ? day.topics : []).filter((t) => t.person === cur.p.name);
  async function addTopic() {
    if (!text.trim()) return;
    await api('/api/topics', { method: 'POST', body: JSON.stringify({ person: cur.p.name, text }) });
    setText(''); await reload();
  }
  return (
    <div className="v-split">
      <aside className="v-list">
        <h2>Personas</h2>
        <label className="srch6 v-srch"><input type="search" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {shown.map(({ p, d }) => (
          <button key={p.name} className={`v-row ${cur.p.name === p.name ? 'sel' : ''}`} onClick={() => setSel(p.name)}>
            <span className="av6" style={avStyle(p.name)}>{initials(p.name)}</span>
            <span className="v-row-b"><b>{p.name}</b><span>{d.oneOnOne ? `Próxima reunión: ${meetingLabel(d.oneOnOne)}` : p.email || ''}</span></span>
            {(d.auto.length + (Array.isArray(day.topics) ? day.topics : []).filter((t) => t.person === p.name && !t.done).length) > 0 && <span className="cnt6">{d.auto.length + (Array.isArray(day.topics) ? day.topics : []).filter((t) => t.person === p.name && !t.done).length}</span>}
          </button>
        ))}
      </aside>
      <div className="v-detail">
        <header className="v-head">
          <span className="av6 lg" style={avStyle(cur.p.name)}>{initials(cur.p.name)}</span>
          <div><h2>{cur.p.name}</h2><p className="muted">{cur.p.email || 'Sin correo registrado'}</p></div>
          {d.oneOnOne && <button className="btn6 ghost" onClick={() => open('event', d.oneOnOne!.id)}>Preparar {meetingLabel(d.oneOnOne)}</button>}
        </header>
        {d.absences.length > 0 && <div className="v-alerts">{d.absences.map((t) => <div key={t.id} className="v-alert media">Ausencia o vacaciones: {t.description}</div>)}</div>}
        <Section title={`Temas para hablar con ${cur.p.name.split(' ')[0]}`} count={d.auto.length + topics.filter((t) => !t.done).length} empty="No hay temas pendientes con esta persona.">
          {topics.map((t) => (
            <div key={t.id} className={`v-topic ${t.done ? 'done' : ''}`}>
              <button className="cb4" aria-label={t.done ? 'Reabrir' : 'Marcar como hablado'} onClick={async () => { await api(`/api/topics/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }); reload(); }}>{t.done ? '✓' : ''}</button>
              <span>{t.text}</span><span className="v-tag">Anotado</span>
              <button className="ib5" title="Eliminar" onClick={async () => { await api(`/api/topics/${t.id}`, { method: 'DELETE' }); reload(); }}>✕</button>
            </div>
          ))}
          {d.auto.map((a, i) => <Item key={i} title={a.text} right={<span className="v-tag auto">{a.kind}</span>} onClick={a.ref ? () => open(a.ref!.type, a.ref!.id) : undefined} />)}
        </Section>
        <div className="v-add"><input placeholder={`Anotar un tema para ${cur.p.name.split(' ')[0]}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTopic()} /><button className="btn6" onClick={addTopic} disabled={!text.trim()}>Agregar</button></div>
        <div className="v-grid">
          <Section title="Próximas reuniones" count={d.meetings.length} empty="No hay reuniones próximas con esta persona.">
            {d.meetings.map((e) => <Item key={e.id} title={e.title} sub={meetingLabel(e)} right={<span className="v-tag">Preparar</span>} onClick={() => open('event', e.id)} />)}
          </Section>
          <Section title="Conversaciones recientes" count={d.convs.length} empty="Sin conversaciones recientes.">
            {d.convs.slice(0, 5).map((c) => <Item key={c.key} title={c.title} sub={`${c.last_author}: ${c.last_text}`} right={<span className="muted">{when(c.last_at)}</span>} onClick={() => open('conv', c.key)} />)}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ================= Preparación de una reunión ================= */
export function MeetingPrep({ day, e, me, meEmail, open }: { day: Day; e: Ev; me: string; meEmail: string; open: Open }) {
  const prep = useMemo(() => meetingPrep(day, e, me, meEmail), [day, e, me, meEmail]);
  const [ai, setAi] = useState<{ loading?: boolean; text?: string; error?: string }>({});
  async function generate() {
    setAi({ loading: true });
    try { const r = await api<{ text: string }>('/api/prep', { method: 'POST', body: JSON.stringify({ context: prepAsText(e, prep) }) }); setAi({ text: r.text }); }
    catch (err) { setAi({ error: (err as Error).message }); }
  }
  const nothing = !prep.alerts.length && !prep.myCommitments.length && !prep.theirCommitments.length && !prep.convs.length && !prep.mails.length && !prep.proposals.length && !prep.topics.length;
  return (
    <div className="prep">
      <div className="prep-h"><h3>Preparación</h3>{prep.client && <span className="v-tag">{prep.client.name}</span>}
        {day.ai && <button className="btn6 ghost sm" onClick={generate} disabled={ai.loading}>{ai.loading ? 'Generando…' : 'Resumir con Claude'}</button>}</div>
      {ai.text && <div className="sug5" style={{ whiteSpace: 'pre-wrap' }}>{ai.text}</div>}
      {ai.error && <div className="err-box">{ai.error}</div>}
      <div className="prep-people">{prep.participants.length ? prep.participants.map((p: PersonRow) => <span key={p.name} className="chip-p"><span className="av6 xs" style={avStyle(p.name)}>{initials(p.name)}</span>{p.name}</span>) : <span className="muted">Sin participantes registrados.</span>}</div>
      {nothing && <p className="muted">No encontré pendientes ni conversaciones recientes relacionadas con esta reunión.</p>}
      {prep.alerts.length > 0 && <div className="v-alerts">{prep.alerts.map((a, i) => <div key={i} className={`v-alert ${a.level}`}>{a.text}</div>)}</div>}
      {prep.topics.length > 0 && <Section title="Temas que anotaste" count={prep.topics.length}>{prep.topics.map((t) => <Item key={t.id} title={t.text} sub={t.person} />)}</Section>}
      {prep.myCommitments.length > 0 && <Section title="Lo que te comprometiste a hacer" count={prep.myCommitments.length}>{prep.myCommitments.map((t) => { const di = dueInfo(t.due); return <Item key={t.id} title={t.description} right={<span className={`v-due ${di.cls}`}>{di.label}</span>} onClick={() => open('task', t.id)} />; })}</Section>}
      {prep.theirCommitments.length > 0 && <Section title="Lo que quedaron en hacer otros" count={prep.theirCommitments.length}>{prep.theirCommitments.map(({ who, t }) => { const di = dueInfo(t.due); return <Item key={t.id} title={t.description} sub={who} right={<span className={`v-due ${di.cls}`}>{di.label}</span>} onClick={() => open('task', t.id)} />; })}</Section>}
      {prep.proposals.length > 0 && <Section title="Accionables por confirmar" count={prep.proposals.length}>{prep.proposals.map((x) => <Item key={x.id} title={x.action} onClick={() => open('prop', x.id)} />)}</Section>}
      {prep.convs.length > 0 && <Section title="Conversaciones de las últimas dos semanas" count={prep.convs.length}>{prep.convs.map((c) => <Item key={c.key} title={c.title} sub={`${c.last_author}: ${c.last_text}`} right={<span className="muted">{when(c.last_at)}</span>} onClick={() => open('conv', c.key)} />)}</Section>}
      {prep.mails.length > 0 && <Section title="Correos de las últimas dos semanas" count={prep.mails.length}>{prep.mails.map((m) => <Item key={m.id} title={m.subject} sub={m.from_name} right={<span className="muted">{when(m.received_at)}</span>} onClick={() => open('mail', m.id)} />)}</Section>}
    </div>
  );
}

/* ================= Resumen de inicio del día ================= */

export function DailyBrief({ day, me, meEmail, open, lastSeen }: { day: Day; me: string; meEmail: string; open: Open; lastSeen: number }) {
  const b = useMemo(() => dailyBrief(day, me, meEmail, lastSeen), [day, me, meEmail, lastSeen]);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && localStorage.getItem('flockpit:briefCollapsed') === dayKeyNow());
  const [ai, setAi] = useState<{ loading?: boolean; text?: string; error?: string }>({});
  const toggle = () => { const v = !collapsed; setCollapsed(v); localStorage.setItem('flockpit:briefCollapsed', v ? dayKeyNow() : ''); };
  async function summarize() {
    setAi({ loading: true });
    try { const r = await api<{ text: string }>('/api/ai', { method: 'POST', body: JSON.stringify({ mode: 'brief', context: briefAsText(b) }) }); setAi({ text: r.text }); }
    catch (e) { setAi({ error: (e as Error).message }); }
  }
  const lines: { icon: string; cls: string; text: React.ReactNode; onClick?: () => void }[] = [];
  if (b.newMail.length || b.newConv.length || b.newProps.length) lines.push({ icon: '✦', cls: 'b-new', text: <>Desde tu última visita: <b>{b.newMail.length}</b> correos, <b>{b.newConv.length}</b> mensajes y <b>{b.newProps.length}</b> accionables nuevos.</> });
  b.overdue.slice(0, 3).forEach((t) => lines.push({ icon: '!', cls: 'b-late', text: <>Vencida: <b>{t.description}</b> · {t.project}</>, onClick: () => open('task', t.id) }));
  b.dueToday.slice(0, 3).forEach((t) => lines.push({ icon: '◷', cls: 'b-today', text: <>Vence hoy: <b>{t.description}</b> · {t.project}</>, onClick: () => open('task', t.id) }));
  if (b.waitingPeople.length) lines.push({ icon: '↩', cls: 'b-wait', text: <>Esperan tu respuesta: <b>{b.waitingPeople.slice(0, 4).join(', ')}</b>{b.waitingPeople.length > 4 ? ` y ${b.waitingPeople.length - 4} más` : ''}.</> });
  b.lateOthers.slice(0, 3).forEach((t: Task) => lines.push({ icon: '⟲', cls: 'b-follow', text: <><b>{t.owner}</b> tiene atrasado: {t.description}. <span className="b-act">Preparar seguimiento</span></>, onClick: () => open('followup', t.id) }));
  if (b.next) lines.push({ icon: '▸', cls: 'b-meet', text: <>Próxima reunión: <b>{hhmm(b.next.start_at)} · {b.next.title}</b>. <span className="b-act">Preparar</span></>, onClick: () => open('event', b.next!.id) });
  if (b.risk.length) lines.push({ icon: '●', cls: 'b-late', text: <>Clientes en riesgo: <b>{b.risk.join(', ')}</b>.</> });
  return (
    <section className="brief">
      <div className="brief-h"><h2>Tu resumen de hoy</h2><span className="muted">{b.meetingsToday.length} reuniones · {b.overdue.length + b.dueToday.length} tareas para hoy o vencidas · {b.waitingPeople.length} personas esperan respuesta</span>
        {day.ai && !collapsed && <button className="btn6 ghost sm" onClick={summarize} disabled={ai.loading}>{ai.loading ? 'Resumiendo…' : 'Resumir con Claude'}</button>}
        <button className="lk6" onClick={toggle}>{collapsed ? 'Mostrar' : 'Ocultar'}</button></div>
      {!collapsed && <>
        {ai.text && <div className="sug5" style={{ whiteSpace: 'pre-wrap' }}>{ai.text}</div>}
        {ai.error && <div className="err-box">{ai.error}</div>}
        <ul className="brief-l">{lines.length ? lines.map((l, i) => <li key={i} className={`${l.cls} ${l.onClick ? 'click' : ''}`} onClick={l.onClick}><span className="b-ic">{l.icon}</span><span>{l.text}</span></li>) : <li className="b-ok"><span className="b-ic">✓</span><span>Nada urgente: no hay vencimientos, respuestas pendientes ni atrasos.</span></li>}</ul>
      </>}
    </section>
  );
}
const dayKeyNow = () => new Date().toISOString().slice(0, 10);

/* ================= Seguimiento con borrador ================= */
export function FollowUp({ day, t, close }: { day: Day; t: Task; close: () => void }) {
  const [text, setText] = useState(() => followUpTemplate(t));
  const [state, setState] = useState<{ loading?: boolean; error?: string; copied?: boolean }>({});
  const link = (t.sources || []).find((s: any) => s.link)?.link as string | undefined;
  async function improve() {
    setState({ loading: true });
    try { const r = await api<{ text: string }>('/api/ai', { method: 'POST', body: JSON.stringify({ mode: 'followup', context: `Persona: ${t.owner}\nCompromiso: ${t.description}\nProyecto: ${t.project}\nPlazo acordado: ${t.due || 'sin plazo'}\nNota: ${t.note || ''}` }) }); setText(r.text); setState({}); }
    catch (e) { setState({ error: (e as Error).message }); }
  }
  const late = t.due ? Math.round((Date.now() - Date.parse(t.due + 'T12:00:00Z')) / 864e5) : 0;
  return (
    <div>
      <div className="dr-h"><div><div className="k">Seguimiento · {t.project}</div><h2>{t.description}</h2></div><button className="x" onClick={close} aria-label="Cerrar">✕</button></div>
      <p className="muted">A cargo de <b>{t.owner}</b>{t.due ? ` · plazo ${t.due.split('-').reverse().join('/')}${late > 0 ? ` · atrasado ${late} día${late === 1 ? '' : 's'}` : ''}` : ''}</p>
      <label className="dfld"><span>Mensaje sugerido (revisalo antes de enviarlo)</span><textarea className="draft" value={text} onChange={(e) => setText(e.target.value)} /></label>
      {state.error && <div className="err-box">{state.error}</div>}
      <div className="dr5-bar">
        <button className="btn6" onClick={async () => { await navigator.clipboard.writeText(text); setState({ copied: true }); }}>{state.copied ? 'Copiado ✓' : 'Copiar mensaje'}</button>
        {link && <a className="btn6 ghost" href={link} target="_blank" rel="noreferrer">Abrir conversación original</a>}
        {day.ai && <button className="btn6 ghost" onClick={improve} disabled={state.loading}>{state.loading ? 'Redactando…' : 'Redactar con Claude'}</button>}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Flockpit no envía mensajes: copialo y mandalo desde Outlook, Teams o Slack.</p>
    </div>
  );
}

/* ================= Borrador de respuesta ================= */
export function ReplyDraft({ context }: { context: string }) {
  const [s, setS] = useState<{ loading?: boolean; text?: string; error?: string; copied?: boolean }>({});
  async function go() {
    setS({ loading: true });
    try { const r = await api<{ text: string }>('/api/ai', { method: 'POST', body: JSON.stringify({ mode: 'reply', context }) }); setS({ text: r.text }); }
    catch (e) { setS({ error: (e as Error).message }); }
  }
  if (!s.text && !s.error) return <button className="btn6 ghost" onClick={go} disabled={s.loading}>{s.loading ? 'Redactando…' : 'Sugerir respuesta'}</button>;
  return (
    <div className="tf5" style={{ width: '100%' }}>
      {s.error ? <div className="err-box">{s.error}</div> : <>
        <label className="dfld"><span>Borrador de respuesta (revisalo antes de enviarlo)</span><textarea className="draft" value={s.text} onChange={(e) => setS({ ...s, text: e.target.value })} /></label>
        <button className="btn6" onClick={async () => { await navigator.clipboard.writeText(s.text || ''); setS({ ...s, copied: true }); }}>{s.copied ? 'Copiado ✓' : 'Copiar'}</button>
      </>}
    </div>
  );
}

/* ================= Preguntale a Flockpit ================= */
type AskSrc = { type: string; id: string; title: string; sub: string; date: string | null; link: string | null; n?: number; cited?: boolean };
export function AskPanel({ initial, open, close }: { initial: string; open: Open; close: () => void }) {
  const [q, setQ] = useState(initial);
  const [r, setR] = useState<{ loading?: boolean; answer?: string | null; sources?: AskSrc[]; note?: string; error?: string }>({});
  async function ask(question: string) {
    if (!question.trim()) return;
    setR({ loading: true });
    try { setR(await api('/api/ask', { method: 'POST', body: JSON.stringify({ q: question }) })); }
    catch (e) { setR({ error: (e as Error).message }); }
  }
  useEffect(() => { ask(initial); }, [initial]); // eslint-disable-line
  const linkify = (text: string) => text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/); const src = m && r.sources?.find((s) => s.n === Number(m[1]));
    return src ? <button key={i} className="cite" onClick={() => open(src.type, src.id)} title={src.title}>{m![1]}</button> : <span key={i}>{part}</span>;
  });
  return (
    <div>
      <div className="dr-h"><div><div className="k">Preguntale a Flockpit</div><h2>Buscá en tus correos, mensajes, reuniones y tareas</h2></div><button className="x" onClick={close} aria-label="Cerrar">✕</button></div>
      <form className="ask-f" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por ejemplo: ¿qué quedó con Andes sobre el back office?" autoFocus /><button className="btn6" type="submit">Preguntar</button></form>
      {r.loading && <p className="muted">Buscando…</p>}
      {r.error && <div className="err-box">{r.error}</div>}
      {r.answer && <div className="ask-a">{linkify(r.answer)}</div>}
      {r.note && <p className="muted">{r.note}</p>}
      {!!r.sources?.length && <section className="v-sec"><h3>Fuentes<span className="cnt6">{r.sources.length}</span></h3>
        {r.sources.map((s) => <Item key={s.type + s.id} title={`${s.n ? `[${s.n}] ` : ''}${s.title}`} sub={`${s.sub}${s.date ? ' · ' + when(s.date) : ''}`} right={s.cited ? <span className="v-tag">Citada</span> : undefined} onClick={() => open(s.type, s.id)} />)}</section>}
    </div>
  );
}
