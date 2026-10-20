import { db, must } from './db';
import { graph, includeTeams } from './microsoft';
import { slack, slackConn, slackText, slackUserName } from './slack';
import { analyzeUser } from './analyze';

export type Source = 'mail' | 'calendar' | 'teams' | 'slack';
const DAY = 864e5;

async function mark(uid: string, source: string, ok: boolean, err?: string, meta?: Record<string, unknown>) {
  const now = new Date().toISOString();
  const prev = await db().from('sync_state').select('last_success_at').eq('user_id', uid).eq('source', source).maybeSingle();
  const row: Record<string, unknown> = { user_id: uid, source };
  if (ok) { row.last_success_at = now; row.prev_success_at = prev.data?.last_success_at || null; row.last_error = null; if (meta) row.meta = meta; }
  else { row.last_error = err?.slice(0, 500); row.last_error_at = now; }
  await db().from('sync_state').upsert(row);
}

async function syncMail(uid: string) {
  const folder = await graph<{ unreadItemCount: number; totalItemCount: number }>(uid, '/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount');
  const res = await graph<{ value: any[] }>(uid, '/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,receivedDateTime,isRead,bodyPreview,webLink');
  const rows = res.value.map((m) => ({
    user_id: uid, id: m.id, conversation_id: m.conversationId, subject: m.subject || '(Sin asunto)',
    from_name: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Desconocido', from_email: m.from?.emailAddress?.address || '',
    received_at: m.receivedDateTime, is_read: m.isRead, preview: (m.bodyPreview || '').slice(0, 500), web_link: m.webLink, updated_at: new Date().toISOString(),
  }));
  if (rows.length) await must(db().from('mail_items').upsert(rows));
  return { unread: folder.unreadItemCount, total: folder.totalItemCount, fetched: rows.length };
}

async function syncCalendar(uid: string) {
  const start = new Date(Date.now() - 7 * DAY), end = new Date(Date.now() + 8 * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const res = await graph<{ value: any[] }>(uid,
    `/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=200&$select=id,subject,start,end,isAllDay,isCancelled,location,onlineMeeting,webLink,organizer`,
    { Prefer: 'outlook.timezone="UTC"' });
  const iso = (d: { dateTime: string }) => new Date(d.dateTime.replace(/\.\d+$/, '') + 'Z').toISOString();
  const rows = res.value.map((e) => ({
    user_id: uid, id: e.id, title: (e.subject || '(Sin título)').replace(/^(Canceled|Cancelado):\s*/i, ''), start_at: iso(e.start), end_at: iso(e.end),
    all_day: !!e.isAllDay, cancelled: !!e.isCancelled, location: e.location?.displayName || null, join_url: e.onlineMeeting?.joinUrl || null,
    web_link: e.webLink, organizer: e.organizer?.emailAddress?.name || null, updated_at: new Date().toISOString(),
  }));
  // Lo que ya no está en el calendario dentro de la ventana se elimina (reuniones borradas o reemplazadas).
  await db().from('events').delete().eq('user_id', uid).gte('start_at', start.toISOString()).lte('start_at', end.toISOString());
  if (rows.length) await must(db().from('events').insert(rows));
  return { fetched: rows.length };
}

async function syncTeams(uid: string, meOid: string) {
  const res = await graph<{ value: any[] }>(uid, '/me/chats?$expand=lastMessagePreview&$top=50');
  const since = Date.now() - 7 * DAY;
  const recent = res.value.filter((c) => c.lastMessagePreview && Date.parse(c.lastMessagePreview.createdDateTime) > since);
  const rows = [];
  for (const c of recent.slice(0, 40)) {
    let title = c.topic as string | null;
    if (!title) {
      try {
        const mem = await graph<{ value: any[] }>(uid, `/chats/${encodeURIComponent(c.id)}/members`);
        title = mem.value.filter((m) => m.userId !== meOid).map((m) => m.displayName).slice(0, 3).join(', ');
      } catch { title = 'Chat de Teams'; }
    }
    const lm = c.lastMessagePreview;
    const mine = lm.from?.user?.id === meOid;
    rows.push({
      user_id: uid, key: `teams:${c.id}`, platform: 'teams', kind: c.chatType === 'oneOnOne' ? 'dm' : c.chatType === 'meeting' ? 'meeting' : 'group',
      title: title || 'Chat de Teams', last_id: lm.id, last_author: mine ? 'Vos' : lm.from?.user?.displayName || 'Desconocido',
      last_text: String(lm.body?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      last_at: lm.createdDateTime, link: c.webUrl || null, participated: mine, updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) await must(db().from('conversations').upsert(rows));
  return { fetched: rows.length };
}

async function syncSlack(uid: string) {
  const conn = await slackConn(uid);
  if (!conn) return { skipped: 'no conectado' };
  const after = new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10);
  const matches: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const j = await slack<any>(conn.token, 'search.messages', { query: `after:${after}`, count: 100, page, sort: 'timestamp', sort_dir: 'desc' });
    matches.push(...(j.messages?.matches || []));
    if (page >= (j.messages?.paging?.pages || 1)) break;
  }
  const me = conn.slackUserId;
  const groups = new Map<string, any[]>();
  for (const m of matches) {
    const ch = m.channel || {};
    const thread = (m.permalink || '').match(/thread_ts=([\d.]+)/)?.[1];
    const mention = String(m.text || '').includes(`<@${me}`);
    const relevant = ch.is_im || ch.is_mpim || mention || thread;
    if (!relevant) continue;
    const key = `slack:${ch.id}${thread ? ':' + thread : ''}`;
    const g = groups.get(key) || [];
    g.push({ ...m, _mention: mention, _thread: !!thread });
    groups.set(key, g);
  }
  const rows = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => Number(b.ts) - Number(a.ts));
    const last = list[0], ch = last.channel || {};
    const threadMine = list.some((x) => x.user === me);
    if (list[0]._thread && !threadMine && !list.some((x) => x._mention)) continue; // hilos ajenos sin mención
    const author = last.user === me ? 'Vos' : last.username || (await slackUserName(conn.token, last.user));
    let title = ch.is_im ? (last.user === me ? await slackUserName(conn.token, ch.user || '') : author)
      : ch.is_mpim ? String(ch.name || '').replace(/^mpdm-/, '').replace(/-\d+$/, '').split('--').join(', ')
      : `#${ch.name}`;
    if (ch.is_im && (!title || title === 'Desconocido')) title = 'Mensaje directo';
    rows.push({
      user_id: uid, key, platform: 'slack', kind: ch.is_im ? 'dm' : ch.is_mpim ? 'group' : 'channel', title,
      last_id: last.ts, last_author: author, last_text: slackText(last.text).slice(0, 400), last_at: new Date(Number(last.ts) * 1000).toISOString(),
      link: last.permalink, mention: list.some((x) => x._mention), thread: list[0]._thread, participated: threadMine, updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) await must(db().from('conversations').upsert(rows));
  return { fetched: rows.length };
}

export async function syncUser(uid: string, sources: Source[] = ['mail', 'calendar', 'teams', 'slack']) {
  const user = await must(db().from('users').select('ms_oid').eq('id', uid).single()) as { ms_oid: string };
  if (user.ms_oid.startsWith('demo-')) return { demo: { ok: true, note: 'Modo demo: datos de ejemplo, sin conexiones.' } };
  const out: Record<string, unknown> = {};
  const run = async (s: Source, fn: () => Promise<unknown>) => {
    try { const meta = await fn(); out[s] = { ok: true, ...(meta as object) }; await mark(uid, s, true, undefined, meta as Record<string, unknown>); }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); out[s] = { ok: false, error: msg }; await mark(uid, s, false, msg); }
  };
  if (sources.includes('mail')) await run('mail', () => syncMail(uid));
  if (sources.includes('calendar')) await run('calendar', () => syncCalendar(uid));
  if (sources.includes('teams') && includeTeams()) await run('teams', () => syncTeams(uid, user.ms_oid));
  if (sources.includes('slack')) await run('slack', () => syncSlack(uid));
  try { out.analysis = await analyzeUser(uid); await mark(uid, 'analysis', true); }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); out.analysis = { ok: false, error: msg }; await mark(uid, 'analysis', false, msg); }
  return out;
}
