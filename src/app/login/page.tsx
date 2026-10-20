export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand-name">flock<span>pit</span></div>
        <h1>Tu trabajo, en un solo lugar</h1>
        <p>Correo, calendario, Teams y Slack en una mesa de trabajo. Al iniciar sesión, Microsoft te pide permiso para leer tu correo y tu calendario. Flockpit no envía mensajes.</p>
        {searchParams.error && <div className="login-error">{searchParams.error}</div>}
        <a className="btn6 big" href="/api/auth/microsoft">Iniciar sesión con Microsoft</a>
        <a className="btn6 big ghost" href="/api/auth/demo" style={{ marginTop: 10 }}>Probar con datos de ejemplo</a>
        <p className="muted" style={{ fontSize: 13 }}>La demo usa datos ficticios y no se conecta a ninguna cuenta.</p>
      </div>
    </main>
  );
}
