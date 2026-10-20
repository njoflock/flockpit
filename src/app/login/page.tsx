export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand-name">flock<span>pit</span></div>
        <h1>Tu trabajo, en un solo lugar</h1>
        <p>Correo, calendario, Teams y Slack en una mesa de trabajo. Al iniciar sesión, Microsoft te va a pedir permiso para leer tu correo, tu calendario y tus chats. Flockpit no envía mensajes.</p>
        {searchParams.error && <div className="login-error">{searchParams.error}</div>}
        <a className="btn6 big" href="/api/auth/microsoft">Iniciar sesión con Microsoft</a>
      </div>
    </main>
  );
}
