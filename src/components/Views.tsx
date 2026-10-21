'use client';
import { useMemo, useState } from 'react';
import type { Day, Ev } from '@/lib/shared';
import { api, avStyle, cap, dueInfo, fmt, hhmm, initials, when } from '@/lib/shared';
import { clients, clientData, people, personData, meetingPrep, prepAsText, type PersonRow } from '@/lib/relate';

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
  const d = cur.d, topics = (day.topics || []).filter((t) => t.person === cur.p.name);
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
            {(d.auto.length + (day.topics || []).filter((t) => t.person === p.name && !t.done).length) > 0 && <span className="cnt6">{d.auto.length + (day.topics || []).filter((t) => t.person === p.name && !t.done).length}</span>}
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
