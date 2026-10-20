'use client';
import { useState } from 'react';

export default function ImportForm() {
  const [msg, setMsg] = useState('');
  async function onFile(f: File) {
    setMsg('Importando…');
    try {
      const body = JSON.parse(await f.text());
      const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      setMsg(r.ok ? `Listo: ${j.tasks} tareas y ${j.proposals} propuestas importadas.` : j.error);
    } catch { setMsg('El archivo no es un JSON válido.'); }
  }
  return (
    <div className="import">
      <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
