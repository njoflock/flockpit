import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import ImportForm from '@/components/ImportForm';

export const dynamic = 'force-dynamic';
export default async function Ajustes({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { data } = await db().from('connections').select('provider,status,last_error,updated_at,scopes').eq('user_id', s.uid);
  const c = Object.fromEntries((data || []).map((x: any) => [x.provider, x]));
  const row = (name: string, p: string, connectHref: string, note: string) => {
    const x = c[p];
    return (
      <div className="conn">
        <div><b>{name}</b><p className="muted">{x ? (x.status === 'ok' ? 'Conectado' : 'Necesita volver a conectarse') : 'Sin conectar'} · {note}</p>{x?.last_error && <p className="err5">{x.last_error}</p>}</div>
        <a className={`btn6 ${x?.status === 'ok' ? 'ghost' : ''}`} href={connectHref}>{x ? 'Volver a conectar' : 'Conectar'}</a>
      </div>
    );
  };
  return (
    <main className="settings">
      <a href="/" className="lk6">← Volver a Mi día</a>
      <h1>Ajustes</h1>
      <p className="muted">Sesión de {s.email}</p>
      {s.demo && <div className="ok-box">Estás en modo demo: los datos son ficticios. Para usar tus cuentas, cerrá sesión e iniciá con Microsoft.</div>}
      {searchParams.ok && <div className="ok-box">Slack quedó conectado y sincronizado.</div>}
      {searchParams.error && <div className="login-error">{searchParams.error}</div>}
      <h2>Conexiones</h2>
      {row('Microsoft 365 (correo, calendario y chats de Teams)', 'microsoft', '/api/auth/microsoft', 'permisos de solo lectura')}
      {row('Slack', 'slack', '/api/connect/slack', 'mensajes directos, menciones e hilos')}
      <h2>Importar datos de Flockpit en Claude</h2>
      <p className="muted">Subí el archivo flockpit-export.json para traer tus tareas, notas y propuestas.</p>
      <ImportForm />
      <form action="/api/auth/logout" method="post"><button className="btn6 ghost" type="submit">Cerrar sesión</button></form>
    </main>
  );
}
