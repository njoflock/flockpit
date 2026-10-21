// Tipos y utilidades compartidas por la interfaz.
export type Mail = { id: string; subject: string; from_name: string; from_email: string; received_at: string; is_read: boolean; preview: string; web_link: string; needs_reply: boolean | null; attention: string | null; reason: string | null; short_title: string | null; analyzed_at: string | null };
export type Person = { name: string; email?: string | null };
export type Ev = { id: string; title: string; start_at: string; end_at: string; all_day: boolean; cancelled: boolean; location: string | null; join_url: string | null; web_link: string | null; organizer: string | null; attendees?: Person[] | null };
export type Conv = { key: string; platform: 'teams' | 'slack'; kind: string; title: string; last_id: string; last_author: string; last_text: string; last_at: string; link: string | null; mention: boolean; thread: boolean; reply_count: number | null; needs_reply: boolean | null; reason: string | null; short_title: string | null; analyzed_last_id: string | null };
export type Task = { id: string; description: string; project: string; owner: string; due: string | null; priority: 'alta' | 'media' | 'baja'; status: string; note: string; source_key: string | null; sources: any[]; event_at: string | null };
export type Prop = { id: string; key: string; action: string; project: string | null; owner: string | null; due: string | null; priority: string; reason: string | null; kind: string | null; sources: any[] };
export type Sync = { source: string; last_success_at: string | null; prev_success_at: string | null; last_error: string | null; last_error_at: string | null; meta: any };
export type Topic = { id: string; person: string; text: string; done: boolean; created_at: string };
export type Day = { me: { name: string; email: string }; demo?: boolean; ai?: boolean; topics?: Topic[]; mail: Mail[]; events: Ev[]; convs: Conv[]; tasks: Task[]; proposals: Prop[]; reviews: { item_key: string; last_id: string | null }[]; sync: Sync[]; conns: { provider: string; status: string; last_error: string | null }[] };

/* ---------- utilidades ---------- */
export const TZ = 'America/Argentina/Buenos_Aires';
export const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...o }).format(d);
export const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const hhmm = (s: string) => fmt(new Date(s), { hour: '2-digit', minute: '2-digit', hour12: false });
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function when(s: string | null) {
  if (!s) return '—';
  const d = new Date(s), diff = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(new Date()))) / 864e5);
  if (diff === 0) return hhmm(s);
  if (diff === -1) return 'Ayer';
  return cap(fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''));
}
export function dueInfo(due: string | null) {
  if (!due) return { label: 'Sin plazo', cls: 'none' };
  const n = Math.round((Date.parse(due) - Date.parse(dayKey(new Date()))) / 864e5);
  if (n < 0) return { label: n === -1 ? 'Venció ayer' : `Venció hace ${-n} días`, cls: 'late' };
  if (n === 0) return { label: 'Hoy', cls: 'today' };
  if (n === 1) return { label: 'Mañana', cls: '' };
  return { label: cap(fmt(new Date(due + 'T12:00:00Z'), { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')), cls: '' };
}
export const initials = (n: string) => (n || '?').replace(/[#@(].*$/, '').split(/[\s·|\-,]+/).filter((x) => /\p{L}/u.test(x)).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
export const AV = ['#EDE7FF:#5B23C9', '#FFE4EF:#C40F69', '#DDF5EF:#1E7F68', '#FFF0D9:#B05E00', '#E3EEFF:#2B5BC4'];
export const avStyle = (n: string) => { let h = 0; for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; const [bg, color] = AV[h % AV.length].split(':'); return { background: bg, color }; };
export const AUTO = /no-?reply|noreply|newsletter|notification|mailer|marketing|billing|clickup|gamma\.app|supabase|cabify|fathom\.video|@slack\.com|atlassian/i;
export const STATUS: Record<string, string> = { pendiente: 'Pendiente', en_curso: 'En curso', bloqueada: 'Bloqueada', completada: 'Completada' };
export const isMine = (t: Task, me: string) => ['', 'yo', 'vos', 'por confirmar', me.toLowerCase(), me.split(' ')[0].toLowerCase()].includes((t.owner || '').trim().toLowerCase());
export const SYNC_EVERY = 10 * 60000;

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as T;
}

/* ---------- componente ---------- */
