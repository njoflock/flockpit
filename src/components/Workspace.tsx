'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ---------- tipos ---------- */
import { AUTO, AV, STATUS, SYNC_EVERY, TZ, api, avStyle, cap, dayKey, dueInfo, fmt, hhmm, initials, isMine, when } from '@/lib/shared';
import type { Mail, Ev, Conv, Task, Prop, Sync, Day, Person, Topic } from '@/lib/shared';
import { ClientsView, PeopleView, MeetingPrep, DailyBrief, FollowUp, ReplyDraft, AskPanel } from './Views';
export default function Workspace({ firstName }: { firstName: string }) {
  const [day, setDay] = useState<Day | null>(null);
  const [err, setErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [mailF, setMailF] = useState<'prio' | 'unread' | 'reply' | 'all'>('prio');
  const [mailQ, setMailQ] = useState('');
  const [msgSrc, setMsgSrc] = useState<'all' | 'slack' | 'teams'>('all');
  const [msgF, setMsgF] = useState<'prio' | 'all' | 'dm' | 'mention' | 'thread' | 'reply'>('prio');
  const [msgQ, setMsgQ] = useState('');
  const [menu, setMenu] = useState<'' | 'mail' | 'msg'>('');
  const [tray, setTray] = useState<'mine' | 'follow' | 'prop'>('mine');
  const [trayDue, setTrayDue] = useState<'all' | 'late' | 'today' | 'week' | 'nodate'>('all');
  const [trayQ, setTrayQ] = useState('');
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [panel, setPanel] = useState<{ type: string; id: string } | null>(null);
  const [view, setView] = useState<'dia' | 'clientes' | 'personas'>('dia');
  const [askQ, setAskQ] = useState('');
  const [lastSeen] = useState(() => (typeof window === 'undefined' ? 0 : Number(localStorage.getItem('flockpit:lastSeen') || 0)));
  useEffect(() => { const t = setTimeout(() => localStorage.setItem('flockpit:lastSeen', String(Date.now())), 5000); return () => clearTimeout(t); }, []);
  const [sel, setSel] = useState('');
  const lastSync = useRef(0);

  const load = useCallback(async () => {
    try { setDay(await api<Day>('/api/day')); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, []);
  const sync = useCallback(async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await api<Record<string, any>>('/api/sync', { method: 'POST' });
      const failed = Object.entries(r).filter(([, v]) => v && v.ok === false).map(([k]) => k);
      if (failed.length) setToast({ msg: `No se pudo actualizar: ${failed.join(', ')}. Se conservan los datos anteriores.` });
      else if (!silent) setToast({ msg: 'Actualizado' });
    } catch (e) { setToast({ msg: (e as Error).message }); }
    lastSync.current = Date.now(); setSyncing(false); await load();
  }, [syncing, load]);

  // carga inicial + actualización automática mientras la app está abierta y visible
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!day) return;
    const last = Math.min(...['mail', 'calendar'].map((s) => Date.parse(day.sync.find((x) => x.source === s)?.last_success_at || '0')));
    if (!lastSync.current && Date.now() - last > SYNC_EVERY) { lastSync.current = Date.now(); sync(true); }
  }, [day]); // eslint-disable-line
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSync.current >= SYNC_EVERY) sync(true); else load();
    }, 60000);
    return () => clearInterval(t);
  }, [sync, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { const c = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.flt6')) setMenu(''); }; document.addEventListener('click', c); return () => document.removeEventListener('click', c); }, []);

  const me = day?.me.name || firstName;
  const reviewed = useMemo(() => new Map((day?.reviews || []).map((r) => [r.item_key, r.last_id])), [day]);
  const prevMailSync = day?.sync.find((s) => s.source === 'mail')?.prev_success_at || null;

  /* ---------- correo ---------- */
  const mails = useMemo(() => {
    const q = mailQ.toLowerCase();
    return (day?.mail || []).filter((m) => {
      const prio = m.needs_reply || m.attention === 'review' || (!m.is_read && !AUTO.test(m.from_email));
      if (mailF === 'prio' && !prio) return false;
      if (mailF === 'unread' && m.is_read) return false;
      if (mailF === 'reply' && !(m.needs_reply || m.attention)) return false;
      return !q || `${m.from_name} ${m.subject} ${m.preview}`.toLowerCase().includes(q);
    });
  }, [day, mailF, mailQ]);
  const mailSync = day?.sync.find((s) => s.source === 'mail');

  /* ---------- mensajes ---------- */
  const convs = useMemo(() => {
    const q = msgQ.toLowerCase();
    return (day?.convs || []).filter((c) => {
      const rev = reviewed.get(`conv:${c.key}`) === c.last_id;
      if (msgSrc !== 'all' && c.platform !== msgSrc) return false;
      if (msgF === 'prio' && !(c.needs_reply || ((c.mention || c.thread || c.kind === 'dm') && c.last_author !== 'Vos' && !rev))) return false;
      if (msgF === 'dm' && c.kind !== 'dm') return false;
      if (msgF === 'mention' && !c.mention) return false;
      if (msgF === 'thread' && !c.thread) return false;
      if (msgF === 'reply' && !c.needs_reply) return false;
      return !q || `${c.title} ${c.last_text} ${c.last_author}`.toLowerCase().includes(q);
    }).sort((a, b) => Number(!!b.needs_reply) - Number(!!a.needs_reply) || b.last_at.localeCompare(a.last_at));
  }, [day, msgSrc, msgF, msgQ, reviewed]);

  /* ---------- pendientes ---------- */
  const trayItems = useMemo(() => {
    if (!day) return [];
    const q = trayQ.toLowerCase();
    const keep = (due: string | null) => {
      if (trayDue === 'all') return true;
      if (trayDue === 'nodate') return !due;
      if (!due) return false;
      const n = Math.round((Date.parse(due) - Date.parse(dayKey(new Date()))) / 864e5);
      return trayDue === 'late' ? n < 0 : trayDue === 'today' ? n === 0 : n >= 0 && n <= 7;
    };
    const rows = tray === 'prop'
      ? day.proposals.map((p) => ({ kind: 'prop' as const, id: p.id, text: p.action, project: p.project || '—', owner: p.owner || 'Por confirmar', due: p.due, status: 'Por confirmar', priority: p.priority, sub: p.reason || '' }))
      : day.tasks.filter((t) => (tray === 'mine') === isMine(t, me)).map((t) => ({ kind: 'task' as const, id: t.id, text: t.description, project: t.project, owner: t.owner, due: t.due, status: STATUS[t.status], priority: t.priority, sub: t.note }));
    return rows.filter((r) => keep(r.due) && (!q || `${r.text} ${r.project} ${r.owner}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || ['alta', 'media', 'baja'].indexOf(a.priority) - ['alta', 'media', 'baja'].indexOf(b.priority));
  }, [day, tray, trayDue, trayQ, me]);
  const counts = useMemo(() => ({
    mine: day?.tasks.filter((t) => isMine(t, me)).length || 0,
    follow: day?.tasks.filter((t) => !isMine(t, me)).length || 0,
    prop: day?.proposals.length || 0,
  }), [day, me]);

  /* ---------- acciones ---------- */
  async function patchTask(id: string, patch: Partial<Task>, undoPatch?: Partial<Task>) {
    await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await load();
    if (undoPatch) setToast({ msg: patch.status === 'completada' ? 'Tarea completada' : 'Cambios guardados', undo: async () => { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(undoPatch) }); load(); } });
  }
  async function review(key: string, last_id?: string) {
    await api('/api/reviewed', { method: 'POST', body: JSON.stringify({ key, last_id }) });
    await load();
    setToast({ msg: 'Marcado como revisado en Flockpit (no cambia el estado en la fuente)', undo: async () => { await api('/api/reviewed', { method: 'POST', body: JSON.stringify({ key, undo: true }) }); load(); } });
  }
  async function proposal(id: string, action: 'confirm' | 'dismiss', edits?: any) {
    await api(`/api/proposals/${id}`, { method: 'POST', body: JSON.stringify({ action, edits }) });
    await load(); setPanel(null);
    setToast({ msg: action === 'confirm' ? 'Agregada a tus tareas' : 'Propuesta descartada', undo: action === 'dismiss' ? async () => { await api(`/api/proposals/${id}`, { method: 'POST', body: JSON.stringify({ action: 'restore' }) }); load(); } : undefined });
  }
  async function createTask(body: any) {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
    await load(); setTray(body.owner && body.owner !== 'Yo' ? 'follow' : 'mine');
    setToast({ msg: 'Tarea creada en la bandeja de pendientes' });
  }
  const open = (type: string, id: string) => { setPanel({ type, id }); setSel(`${type}:${id}`); };

  /* ---------- estado de sincronización ---------- */
  const syncLabel = useMemo(() => {
    if (!day) return { cls: 'old', text: 'Cargando…' };
    const src = ['mail', 'calendar', 'teams', 'slack'].map((s) => day.sync.find((x) => x.source === s));
    const failed = src.filter((s) => s?.last_error && (!s.last_success_at || Date.parse(s.last_error_at || '0') > Date.parse(s.last_success_at))).map((s) => s!.source);
    const times = src.map((s) => s?.last_success_at).filter(Boolean) as string[];
    if (failed.length) return { cls: 'bad', text: `Datos anteriores · falló ${failed.join(', ')}` };
    if (!times.length) return { cls: 'old', text: 'Sin sincronizar todavía' };
    const oldest = times.sort()[0];
    return Date.now() - Date.parse(oldest) < 3 * SYNC_EVERY ? { cls: 'ok', text: `Actualizado ${when(times.sort().reverse()[0])}` } : { cls: 'old', text: `Datos anteriores · ${when(oldest)}` };
  }, [day]);

  if (!day) return <div className="loading">{err ? <><b>No se pudo cargar Flockpit.</b><p>{err}</p></> : 'Cargando…'}</div>;

  /* ---------- agenda ---------- */
  const now = Date.now();
  const evs = day.events.filter((e) => !e.cancelled && !e.all_day);
  const today = evs.filter((e) => dayKey(new Date(e.start_at)) === dayKey(new Date()));
  let upcoming = today.filter((e) => Date.parse(e.end_at) > now);
  let otherDay = '';
  if (!upcoming.length) {
    const nx = evs.find((e) => Date.parse(e.start_at) > now);
    if (nx) { upcoming = evs.filter((e) => dayKey(new Date(e.start_at)) === dayKey(new Date(nx.start_at))); otherDay = cap(fmt(new Date(nx.start_at), { weekday: 'long', day: 'numeric', month: 'long' })); }
  }
  const firstUp = upcoming.find((e) => Date.parse(e.start_at) > now);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand-name">flock<span>pit</span></div>
        <nav className="nav">
          {(['dia', 'clientes', 'personas'] as const).map((v) => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{({ dia: 'Mi día', clientes: 'Clientes y proyectos', personas: 'Personas' } as const)[v]}</button>)}
          <a href="/ajustes">Ajustes y conexiones</a>
        </nav>
        <div className="side-foot">
          {day.conns.map((c) => <span key={c.provider} className={`conn-dot ${c.status === 'ok' ? 'ok' : 'bad'}`}>{c.provider === 'microsoft' ? 'Microsoft 365' : 'Slack'}</span>)}
          {!day.conns.some((c) => c.provider === 'slack') && <a className="conn-dot" href="/api/connect/slack">Conectar Slack</a>}
          <div className="me"><span className="avatar">{initials(me)}</span><b>{me}</b></div>
        </div>
      </aside>

      <main className="main">
        {view === 'clientes' && <ClientsView day={day} me={me} open={open} />}
        {view === 'personas' && <PeopleView day={day} me={me} meEmail={day.me.email} open={open} reload={load} />}
        {view === 'dia' && <div className="d6">
          <header className="h6">
            <div><h1>Buen día, <span>{firstName}</span></h1>{day.demo && <span className="demo-tag">Modo demo · datos ficticios</span>}<div className="h6-d">{cap(fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div>
            <form className="ask-h" onSubmit={(e) => { e.preventDefault(); if (askQ.trim()) setPanel({ type: 'ask', id: askQ.trim() }); }}><input value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="Preguntale a Flockpit…" aria-label="Preguntale a Flockpit" /></form>
            <button className="sync5" onClick={() => setPanel({ type: 'status', id: '' })}><i className={syncLabel.cls} />{syncLabel.text}</button>
            <button className="btn6" disabled={syncing} onClick={() => sync(false)}>{syncing ? 'Actualizando…' : 'Actualizar'}</button>
          </header>

          <DailyBrief day={day} me={me} meEmail={day.me.email} open={open} lastSeen={lastSeen} />

          <section className="ag6">
            <div className="ag6-h"><h2>Tu agenda</h2>{otherDay ? <span className="muted">Hoy no quedan reuniones · {otherDay}</span> : <span className="cnt6">{upcoming.length} por delante hoy</span>}
              <button className="lk6" onClick={() => setAgendaOpen(!agendaOpen)}>{agendaOpen ? 'Ocultar agenda' : `Ver agenda de hoy (${today.length})`}</button></div>
            <div className="ag6-row">
              {upcoming.slice(0, 4).map((e) => {
                const cur = Date.parse(e.start_at) <= now, nx = e === firstUp;
                return (
                  <div key={e.id} className={`mb6 ${cur ? 'cur' : nx ? 'next' : ''}`} onClick={() => open('event', e.id)} role="button" tabIndex={0}>
                    <span className="mb6-b"><span className="mb6-h">{hhmm(e.start_at)}–{hhmm(e.end_at)}{cur ? <b className="tg6 cur">En curso</b> : nx ? <b className="tg6">Próxima</b> : null}</span><span className="mb6-t">{e.title}</span></span>
                    {(cur || nx) && e.join_url && <a className="join6" href={e.join_url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>Unirme</a>}
                  </div>
                );
              })}
              {!upcoming.length && <span className="muted">No hay reuniones próximas.</span>}
              {upcoming.length > 4 && <button className="mb6 more" onClick={() => setAgendaOpen(true)}>+{upcoming.length - 4} más</button>}
            </div>
            {agendaOpen && <div className="ag5-list">{today.map((e) => (
              <button key={e.id} className={`ag5-row ${Date.parse(e.end_at) < now ? 'past' : ''}`} onClick={() => open('event', e.id)}>
                <b>{hhmm(e.start_at)}–{hhmm(e.end_at)}</b><span>{e.title}</span><span className="muted">{Math.round((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000)} min{Date.parse(e.end_at) < now ? ' · Finalizada' : ''}</span>
              </button>))}{!today.length && <p className="muted">No hay reuniones hoy.</p>}</div>}
          </section>

          <div className="mid6">
            <section className="p6 p6-mail">
              <div className="p6-h"><h2>Correo</h2><span className="cnt6">{mailSync?.meta?.unread?.toLocaleString('es-AR') ?? '—'} sin leer</span>
                <label className="srch6"><input type="search" placeholder="Buscar" value={mailQ} onChange={(e) => setMailQ(e.target.value)} aria-label="Buscar correo" /></label></div>
              <div className="p6-f">
                <button className="ch6" aria-pressed={mailF === 'unread'} onClick={() => setMailF(mailF === 'unread' ? 'prio' : 'unread')}>Sin leer</button>
                <button className="ch6" aria-pressed={mailF === 'reply'} onClick={() => setMailF(mailF === 'reply' ? 'prio' : 'reply')}>Por responder</button>
                <span className="flt6"><button className="ch6" onClick={() => setMenu(menu === 'mail' ? '' : 'mail')}>Filtrar · {mailF === 'all' ? 'Todos' : 'Prioritarios'}</button>
                  {menu === 'mail' && <div className="mn6"><button aria-checked={mailF === 'prio'} onClick={() => { setMailF('prio'); setMenu(''); }}>Prioritarios</button><button aria-checked={mailF === 'all'} onClick={() => { setMailF('all'); setMenu(''); }}>Todos los correos</button></div>}</span>
              </div>
              <div className="p6-l">
                {mails.map((m) => (
                  <div key={m.id} className={`r6 ${m.is_read ? '' : 'is-unread'} ${sel === `mail:${m.id}` ? 'sel' : ''}`} onClick={() => open('mail', m.id)} role="button" tabIndex={0}>
                    <span className="av6" style={avStyle(m.from_name)}>{initials(m.from_name)}</span>
                    <span className="r6-b"><span className="r6-l1"><b>{m.from_name}</b>{!m.is_read && <i className="ud6" title="Sin leer en Outlook" />}
                      {m.needs_reply ? <span className="f6 f-reply">Por responder</span> : m.attention === 'review' ? <span className="f6 f-rev">Revisar</span> : reviewed.has(`mail:${m.id}`) ? <span className="f6 f-done">Revisado</span> : prevMailSync && m.received_at > prevMailSync ? <span className="f6 f-new">Nuevo</span> : null}
                      <span className="r6-d">{when(m.received_at)}</span></span>
                      <span className="r6-s">{m.subject}</span><span className="r6-p">{m.preview}</span></span>
                  </div>))}
                {!mails.length && <div className="e5">No hay correos con este filtro. <button className="lk6" onClick={() => setMailF('all')}>Ver todos</button></div>}
                <div className="more5">Mostrando {mails.length} de {day.mail.length} correos sincronizados{mailSync?.meta?.total ? ` (la bandeja tiene ${mailSync.meta.total.toLocaleString('es-AR')})` : ''}.</div>
              </div>
            </section>

            <section className="p6 p6-msg">
              <div className="p6-h"><h2>Mensajes</h2><span className="cnt6 pink">{day.convs.filter((c) => c.needs_reply && reviewed.get(`conv:${c.key}`) !== c.last_id).length} por responder</span>
                <label className="srch6"><input type="search" placeholder="Buscar" value={msgQ} onChange={(e) => setMsgQ(e.target.value)} aria-label="Buscar mensajes" /></label></div>
              <div className="p6-f">
                {(['all', 'slack', 'teams'] as const).map((k) => <button key={k} className="ch6" aria-pressed={msgSrc === k} onClick={() => setMsgSrc(k)}>{k === 'all' ? 'Todos' : k === 'slack' ? 'Slack' : 'Teams'}</button>)}
                <span className="flt6"><button className="ch6" onClick={() => setMenu(menu === 'msg' ? '' : 'msg')}>Filtrar · {({ prio: 'Prioritarias', all: 'Todas', dm: 'Directos', mention: 'Menciones', thread: 'Hilos', reply: 'Por responder' } as const)[msgF]}</button>
                  {menu === 'msg' && <div className="mn6">{(['prio', 'all', 'dm', 'mention', 'thread', 'reply'] as const).map((k) => <button key={k} aria-checked={msgF === k} onClick={() => { setMsgF(k); setMenu(''); }}>{({ prio: 'Prioritarias', all: 'Todas', dm: 'Directos', mention: 'Menciones', thread: 'Hilos', reply: 'Por responder' } as const)[k]}</button>)}</div>}</span>
              </div>
              <div className="p6-l">
                {convs.map((c) => (
                  <div key={c.key} className={`r6 cv ${sel === `conv:${c.key}` ? 'sel' : ''}`} onClick={() => open('conv', c.key)} role="button" tabIndex={0}>
                    <span className="av6" style={avStyle(c.kind === 'dm' ? c.title : c.last_author)}>{initials(c.kind === 'dm' ? c.title : c.last_author)}</span>
                    <span className="r6-b"><span className="r6-l1"><b>{c.title}</b><span className={`pl6 ${c.platform}`}>{c.platform === 'slack' ? 'Slack' : 'Teams'}</span>{c.thread && <span className="pl6 th">Hilo</span>}
                      {c.needs_reply ? <span className="f6 f-reply">Por responder</span> : c.mention ? <span className="f6 f-rev">Mención</span> : null}<span className="r6-d">{when(c.last_at)}</span></span>
                      <span className="r6-s">{c.short_title || (c.kind === 'dm' ? 'Mensaje directo' : c.kind === 'channel' ? 'Canal' : 'Conversación')}</span>
                      <span className="r6-p"><b>{c.last_author}:</b> {c.last_text}</span></span>
                  </div>))}
                {!convs.length && <div className="e5">No hay conversaciones con este filtro. <button className="lk6" onClick={() => setMsgF('all')}>Ver todas</button></div>}
                <div className="more5">Mostrando {convs.length} de {day.convs.length} conversaciones sincronizadas. Teams y Slack no informan si un mensaje está leído.</div>
              </div>
            </section>
          </div>

          <section className="p6 tray6">
            <div className="p6-h">
              <div className="tt5">{(['mine', 'follow', 'prop'] as const).map((k) => <button key={k} aria-selected={tray === k} onClick={() => setTray(k)}>{k === 'mine' ? 'Mis tareas' : k === 'follow' ? 'Seguimientos' : 'Por confirmar'} <span>{counts[k]}</span></button>)}</div>
              <label className="srch6"><input type="search" placeholder="Buscar pendientes" value={trayQ} onChange={(e) => setTrayQ(e.target.value)} aria-label="Buscar pendientes" /></label>
              {tray !== 'prop' && <button className="btn6 ghost" onClick={() => setPanel({ type: 'newtask', id: '' })}>Agregar</button>}
            </div>
            <div className="p6-f">{(['all', 'late', 'today', 'week', 'nodate'] as const).map((k) => <button key={k} className="ch6" aria-pressed={trayDue === k} onClick={() => setTrayDue(k)}>{({ all: 'Todas', late: 'Vencidas', today: 'Hoy', week: 'Esta semana', nodate: 'Sin fecha' } as const)[k]}</button>)}</div>
            <div className="p6-l">
              <div className="tr5 th5"><span /><span>Acción</span><span>Proyecto</span><span>Responsable</span><span>Plazo</span><span>Estado</span><span /></div>
              {trayItems.map((r) => {
                const di = dueInfo(r.due);
                return (
                  <div key={r.id} className={`tr5 ${sel === `${r.kind}:${r.id}` ? 'sel' : ''}`}>
                    {r.kind === 'task' ? <button className="cb4" aria-label={`Completar: ${r.text}`} onClick={() => patchTask(r.id, { status: 'completada' }, { status: 'pendiente' })} /> : <span className="tr5-ic">✦</span>}
                    <button className="tr5-a" onClick={() => open(r.kind, r.id)}><b>{r.text}</b>{r.sub && <span className="muted">{r.sub}</span>}</button>
                    <span className="tr5-c">{r.project}</span><span className="tr5-c">{r.owner}</span>
                    <span className="tr5-c"><span className={di.cls}>{di.label}</span></span>
                    <span className="tr5-c"><span className={`st5 ${r.kind === 'prop' ? 'prop' : ''}`}>{r.status}</span></span>
                    <span className="tr5-x">{r.kind === 'prop' ? <><button className="ib5 ok" title="Confirmar" onClick={() => proposal(r.id, 'confirm')}>✓</button><button className="ib5 no" title="Descartar" onClick={() => proposal(r.id, 'dismiss')}>✕</button></> : <button className="ib5" title="Editar" onClick={() => open('task', r.id)}>✎</button>}</span>
                  </div>);
              })}
              {!trayItems.length && <div className="e5">No hay elementos con estos filtros.</div>}
            </div>
          </section>
        </div>}
      </main>

      {panel && <Panel panel={panel} day={day} me={me} close={() => setPanel(null)} review={review} patchTask={patchTask} proposal={proposal} createTask={createTask} reload={load} open={open} />}
      {toast && <div className="toast">{toast.msg}{toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }}>Deshacer</button>}</div>}
    </div>
  );
}

/* ---------- panel de detalle superpuesto ---------- */
function Panel({ panel, day, me, close, review, patchTask, proposal, createTask, reload, open }: {
  panel: { type: string; id: string }; day: Day; me: string; close: () => void;
  review: (k: string, l?: string) => Promise<void>; patchTask: (id: string, p: Partial<Task>, u?: Partial<Task>) => Promise<void>;
  proposal: (id: string, a: 'confirm' | 'dismiss', e?: any) => Promise<void>; createTask: (b: any) => Promise<void>; reload: () => Promise<void>; open: (type: string, id: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    setData(null); setError(''); setForm(null);
    if (panel.type === 'mail') api(`/api/mail/${encodeURIComponent(panel.id)}`).then(setData).catch((e) => setError(e.message));
    if (panel.type === 'conv') api(`/api/conversations/${encodeURIComponent(panel.id)}`).then(setData).catch((e) => setError(e.message));
  }, [panel]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && close(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [close]);

  let body: React.ReactNode = null;
  if (panel.type === 'mail') {
    const m = day.mail.find((x) => x.id === panel.id)!;
    body = <>
      <Head kicker="Correo" title={m.subject} close={close} />
      <div className="dr5-meta"><b>{m.from_name}</b> <span>{m.from_email} · {when(m.received_at)}</span></div>
      <div className="dr5-states"><span className="mstate">{m.is_read ? 'Leído en Outlook' : 'Sin leer en Outlook'}</span>{day.reviews.some((r) => r.item_key === `mail:${m.id}`) && <span className="mstate ok">Revisado en Flockpit</span>}</div>
      <Bar>
        <button className="btn6 ghost" onClick={close}>Volver al listado</button>
        <a className="btn6" href={m.web_link} target="_blank" rel="noreferrer">Abrir original</a>
        <button className="btn6 ghost" onClick={() => setForm({ description: m.needs_reply ? `Responder a ${m.from_name}: ${m.subject}` : `Revisar: ${m.subject}`, project: '', owner: 'Yo', due: '', priority: 'media', source_key: `mail:${m.id}`, sources: [{ kind: 'email', subject: m.subject, from: m.from_name, date: m.received_at, snippet: m.preview.slice(0, 200), link: m.web_link }] })}>Crear tarea</button>
        <button className="btn6 ghost" onClick={() => review(`mail:${m.id}`)}>Marcar revisado</button>
      </Bar>
      {day.ai && data && <div className="reply-row"><ReplyDraft context={`Correo de ${m.from_name} <${m.from_email}>\nAsunto: ${m.subject}\n\n${data.message?.body?.content || m.preview}`} /></div>}
      {m.reason && <div className="sug5"><b>Sugerencia de Claude:</b> {m.reason}</div>}
      {form && <TaskForm form={form} setForm={setForm} onSave={async () => { await createTask(form); setForm(null); }} />}
      {error && <div className="err-box">{error}</div>}
      {!data && !error && <p className="muted">Cargando el contenido…</p>}
      {data && <pre className="txt5">{data.message?.body?.content}</pre>}
      {data?.thread?.length > 1 && <div className="sec"><h4>En este hilo ({data.thread.length})</h4>{data.thread.map((t: any) => <div key={t.id} className="rel5"><b>{t.from?.emailAddress?.name}</b><span>{t.bodyPreview}</span><span>{when(t.receivedDateTime)}</span></div>)}</div>}
    </>;
  } else if (panel.type === 'conv') {
    const c = day.convs.find((x) => x.key === panel.id)!;
    body = <>
      <Head kicker={`${c.platform === 'slack' ? 'Slack' : 'Teams'}${c.thread ? ' · Hilo' : ''}`} title={c.title} close={close} />
      <div className="dr5-states"><span className="mstate">Sin estado de lectura en {c.platform === 'slack' ? 'Slack' : 'Teams'}</span>{c.last_author === 'Vos' && <span className="mstate ok">Tu respuesta es la última</span>}</div>
      <Bar>
        <button className="btn6 ghost" onClick={close}>Volver</button>
        {c.link && <a className="btn6" href={c.link} target="_blank" rel="noreferrer">Abrir para responder</a>}
        <button className="btn6 ghost" onClick={() => setForm({ description: c.short_title || `Responder a ${c.last_author} en ${c.title}`, project: '', owner: 'Yo', due: '', priority: 'media', source_key: `conv:${c.key}:${c.last_id}`, sources: [{ kind: 'message', platform: c.platform, subject: c.title, from: c.last_author, date: c.last_at, snippet: c.last_text.slice(0, 200), link: c.link }] })}>Crear tarea</button>
        <button className="btn6 ghost" onClick={() => review(`conv:${c.key}`, c.last_id)}>Marcar revisado</button>
      </Bar>
      {day.ai && data?.messages && <div className="reply-row"><ReplyDraft context={`Conversación: ${c.title}\n` + data.messages.map((m: any) => `${m.author}: ${m.text}`).join('\n')} /></div>}
      {c.reason && <div className="sug5"><b>Sugerencia de Claude:</b> {c.reason}</div>}
      {form && <TaskForm form={form} setForm={setForm} onSave={async () => { await createTask(form); setForm(null); }} />}
      {error && <div className="err-box">{error}</div>}
      {!data && !error && <p className="muted">Cargando mensajes…</p>}
      {data?.messages?.map((m: any, i: number) => <div key={i} className={`msg5 ${m.author === 'Vos' ? 'me' : ''}`}><span className="av6" style={avStyle(m.author)}>{initials(m.author)}</span><div><div className="mh5"><b>{m.author}</b><span>{when(m.date)}</span>{m.reply && <span className="pl6 th">Respuesta</span>}</div><div className="mt5">{m.text}</div></div></div>)}
    </>;
  } else if (panel.type === 'followup') {
    const t = day.tasks.find((x) => x.id === panel.id);
    body = t ? <FollowUp day={day} t={t} close={close} /> : <p>La tarea ya no existe.</p>;
  } else if (panel.type === 'ask') {
    body = <AskPanel initial={panel.id} open={open} close={close} />;
  } else if (panel.type === 'task' || panel.type === 'newtask') {
    const t = day.tasks.find((x) => x.id === panel.id);
    const f = form || (t ? { ...t, due: t.due || '' } : { description: '', project: '', owner: 'Yo', due: '', priority: 'media', status: 'pendiente', note: '' });
    body = <>
      <Head kicker={t ? (isMine(t, me) ? 'Mi tarea' : 'Seguimiento') : 'Nueva tarea'} title={t?.description || 'Agregar tarea'} close={close} />
      <TaskForm form={f} setForm={setForm} withStatus={!!t} onSave={async () => {
        if (t) { await patchTask(t.id, { description: f.description, project: f.project, owner: f.owner, due: f.due || null, priority: f.priority, status: f.status, note: f.note }); }
        else await createTask(f);
        close();
      }} />
      {t && t.status !== 'completada' && <Bar>{!isMine(t, me) && <button className="btn6" onClick={() => open('followup', t.id)}>Preparar seguimiento</button>}<button className="btn6 ghost" onClick={async () => { await patchTask(t.id, { status: 'completada' }, { status: t.status }); close(); }}>Completar</button>
        <button className="btn6 ghost danger" onClick={async () => { if (confirm('¿Eliminar esta tarea?')) { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); await reload(); close(); } }}>Eliminar</button></Bar>}
      {t?.sources?.length ? <div className="sec"><h4>Fuente</h4>{t.sources.map((s: any, i: number) => <div key={i} className="ev"><b>{s.from}</b> · {s.subject} · {when(s.date)}<blockquote>{s.snippet}</blockquote>{s.link && <a href={s.link} target="_blank" rel="noreferrer">Abrir original</a>}</div>)}</div> : null}
    </>;
  } else if (panel.type === 'prop') {
    const p = day.proposals.find((x) => x.id === panel.id)!;
    const f = form || { action: p.action, project: p.project || '', owner: p.owner || 'Por confirmar', due: p.due || '', priority: p.priority };
    body = <>
      <Head kicker="Propuesta por confirmar" title={p.action} close={close} />
      {p.reason && <div className="sug5"><b>Por qué se sugiere:</b> {p.reason}</div>}
      <TaskForm form={{ ...f, description: f.action }} setForm={(x: any) => setForm({ ...x, action: x.description })} hideSave onSave={async () => {}} />
      <Bar>
        <button className="btn6" onClick={() => proposal(p.id, 'confirm', { ...f, due: f.due || null })}>Confirmar</button>
        <button className="btn6 ghost danger" onClick={() => proposal(p.id, 'dismiss')}>Descartar</button>
      </Bar>
      {p.sources?.map((s: any, i: number) => <div key={i} className="ev"><b>{s.from}</b> · {s.subject} · {when(s.date)}<blockquote>{s.snippet}</blockquote>{s.link && <a href={s.link} target="_blank" rel="noreferrer">Abrir original</a>}</div>)}
    </>;
  } else if (panel.type === 'event') {
    const e = day.events.find((x) => x.id === panel.id)!;
    body = <>
      <Head kicker={cap(fmt(new Date(e.start_at), { weekday: 'long', day: 'numeric', month: 'long' }))} title={e.title} close={close} />
      <dl className="kv"><dt>Horario</dt><dd>{hhmm(e.start_at)} a {hhmm(e.end_at)} (hora de Argentina)</dd><dt>Organiza</dt><dd>{e.organizer || '—'}</dd>{e.location && <><dt>Lugar</dt><dd>{e.location}</dd></>}</dl>
      <Bar>{e.join_url && <a className="btn6" href={e.join_url} target="_blank" rel="noreferrer">Unirme</a>}{e.web_link && <a className="btn6 ghost" href={e.web_link} target="_blank" rel="noreferrer">Ver en Outlook</a>}</Bar>
      <MeetingPrep day={day} e={e} me={me} meEmail={day.me.email} open={open} />
    </>;
  } else if (panel.type === 'status') {
    body = <>
      <Head kicker="Última consulta exitosa por fuente" title="Estado de actualización" close={close} />
      {['mail', 'calendar', 'teams', 'slack', 'analysis'].map((s) => { const x = day.sync.find((y) => y.source === s); return (
        <div key={s} className="srow"><b>{({ mail: 'Correo', calendar: 'Calendario', teams: 'Teams', slack: 'Slack', analysis: 'Análisis con Claude' } as any)[s]}</b>
          <span>{x?.last_success_at ? when(x.last_success_at) + ' ' + fmt(new Date(x.last_success_at), { day: 'numeric', month: 'short' }) : 'Nunca'}</span>
          {x?.last_error && <span className="err5">Último error: {x.last_error}</span>}</div>); })}
      <p className="muted">Mientras Flockpit está abierto se actualiza cada 10 minutos. Con la app cerrada, la sincronización programada mantiene los datos al día.</p>
    </>;
  }
  return <><div className="scrim" onClick={close} /><aside className="drawer open" role="dialog" aria-modal="true"><div className="dr-b">{body}</div></aside></>;
}

function Head({ kicker, title, close }: { kicker: string; title: string; close: () => void }) {
  return <div className="dr-h"><div><div className="k">{kicker}</div><h2>{title}</h2></div><button className="x" onClick={close} aria-label="Cerrar">✕</button></div>;
}
function Bar({ children }: { children: React.ReactNode }) { return <div className="dr5-bar">{children}</div>; }
function TaskForm({ form, setForm, onSave, withStatus, hideSave }: { form: any; setForm: (f: any) => void; onSave: () => Promise<void>; withStatus?: boolean; hideSave?: boolean }) {
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="tf5">
      <label className="dfld"><span>Acción</span><textarea value={form.description} onChange={set('description')} /></label>
      <div className="drow"><label className="dfld"><span>Proyecto</span><input value={form.project || ''} onChange={set('project')} /></label><label className="dfld"><span>Responsable</span><input value={form.owner || ''} onChange={set('owner')} placeholder="Yo, Por confirmar u otra persona" /></label></div>
      <div className="drow"><label className="dfld"><span>Plazo</span><input type="date" value={form.due || ''} onChange={set('due')} /></label>
        <label className="dfld"><span>Prioridad</span><select value={form.priority} onChange={set('priority')}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label></div>
      {withStatus && <><label className="dfld"><span>Estado</span><select value={form.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="dfld"><span>Nota</span><textarea value={form.note || ''} onChange={set('note')} /></label></>}
      {!hideSave && <button className="btn6" onClick={onSave} disabled={!form.description?.trim()}>Guardar</button>}
    </div>
  );
}
