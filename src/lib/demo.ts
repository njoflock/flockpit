import { db, must } from './db';

// Datos ficticios para mostrar Flockpit sin conectar cuentas reales.
// Las fechas se calculan desde "ahora" para que la demo siempre se vea actual.
const H = 36e5, D = 24 * H;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
function todayAt(h: number, m = 0) {
  const d = new Date();
  // hora de Argentina (UTC-3)
  d.setUTCHours(h + 3, m, 0, 0);
  return d.toISOString();
}
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * D).toISOString().slice(0, 10);

const MAIL = [
  { id: 'd-m1', subject: 'Confirmación del alcance de la entrega de noviembre', from_name: 'Carla Méndez', from_email: 'carla.mendez@andeslogistica.com', ago: 1.5 * H, read: false, needs: true, att: 'reply', reason: 'Pide confirmar el alcance antes del jueves para cerrar el cronograma.', short: 'Confirmar alcance de noviembre', preview: 'Hola, ¿podés confirmarnos el alcance de la entrega de noviembre? Necesitamos la respuesta antes del jueves para cerrar el cronograma con el equipo.' },
  { id: 'd-m2', subject: 'Solicitud de vacaciones: 16 al 27 de noviembre', from_name: 'Martín Ruiz', from_email: 'martin.ruiz@flock.example', ago: 3 * H, read: false, needs: true, att: 'review', reason: 'Solicitud de vacaciones que requiere tu revisión.', short: 'Revisar vacaciones de Martín', preview: 'Te escribo para pedir vacaciones del 16 al 27 de noviembre. Dejo cubiertas las tareas del reporte semanal con Lucía.' },
  { id: 'd-m3', subject: 'Propuesta de reprogramación de la validación', from_name: 'Lucía Paz', from_email: 'lucia.paz@flock.example', ago: 5 * H, read: false, needs: false, att: 'review', reason: 'Propone mover la reunión del jueves al martes; afecta tu agenda.', short: 'Decidir nueva fecha de validación', preview: 'Propongo mover la validación del jueves al martes a las 16:30. La agenda sigue siendo la misma.' },
  { id: 'd-m4', subject: 'Reporte mensual de indicadores', from_name: 'Operaciones', from_email: 'operaciones@flock.example', ago: 9 * H, read: true, needs: false, att: null, reason: 'Informativo.', short: null, preview: 'Adjuntamos el reporte mensual con cumplimiento por sprint, NPS y errores reportados por clientes.' },
  { id: 'd-m5', subject: 'Invitación: Revisión de entrega · Andes Logística', from_name: 'Carla Méndez', from_email: 'carla.mendez@andeslogistica.com', ago: 26 * H, read: false, needs: true, att: 'reply', reason: 'Invitación sin responder para mañana.', short: 'Responder invitación de revisión', preview: 'Reunión de Microsoft Teams. Revisión del alcance ajustado y próximos hitos.' },
  { id: 'd-m6', subject: 'Feedback del MVP de proyección', from_name: 'Diego Sosa', from_email: 'diego.sosa@petroleranorte.com', ago: 30 * H, read: true, needs: true, att: 'reply', reason: 'El cliente pide una fecha para el próximo ajuste.', short: 'Pasar fecha del próximo ajuste', preview: 'Probamos el MVP con el equipo. Funciona bien en general; ¿para cuándo podríamos tener el ajuste de cuellos de botella?' },
  { id: 'd-m7', subject: 'Novedades de la plataforma', from_name: 'Newsletter', from_email: 'newsletter@herramienta.example', ago: 32 * H, read: false, needs: false, att: null, reason: 'Newsletter.', short: null, preview: 'Conocé las nuevas funciones de este mes.' },
  { id: 'd-m8', subject: 'Comprobante de viaje', from_name: 'Movilidad', from_email: 'no-reply@movilidad.example', ago: 40 * H, read: true, needs: false, att: null, reason: 'Notificación automática.', short: null, preview: 'Tu viaje del martes: $12.300.' },
  { id: 'd-m9', subject: 'Acceso al tablero del proyecto', from_name: 'Sofía Gil', from_email: 'sofia.gil@flock.example', ago: 2 * D, read: true, needs: false, att: null, reason: 'Informativo.', short: null, preview: 'Ya tenés acceso al tablero del proyecto de Banco Sur.' },
  { id: 'd-m10', subject: 'Agenda del taller del viernes', from_name: 'Lucía Paz', from_email: 'lucia.paz@flock.example', ago: 2.5 * D, read: true, needs: false, att: null, reason: 'Informativo.', short: null, preview: 'Comparto la agenda preliminar del taller con los bloques de charlas.' },
  { id: 'd-m11', subject: 'Presupuesto actualizado', from_name: 'Pablo Ríos', from_email: 'pablo.rios@bancosur.example', ago: 3 * D, read: true, needs: false, att: null, reason: 'Informativo.', short: null, preview: 'Te reenvío el presupuesto actualizado con los cambios que conversamos.' },
  { id: 'd-m12', subject: 'Encuesta de satisfacción', from_name: 'Calidad', from_email: 'calidad@flock.example', ago: 4 * D, read: true, needs: false, att: null, reason: 'Informativo.', short: null, preview: 'Gracias por completar la encuesta mensual.' },
];
const P = (name: string, email: string) => ({ name, email });
const EVENTS = [
  { id: 'd-e1', title: 'Daily del equipo', h: 9, m: 30, dur: 15, join: true, att: [P('Lucía Paz', 'lucia.paz@flock.example'), P('Martín Ruiz', 'martin.ruiz@flock.example'), P('Nico Vega', 'nico.vega@flock.example')] },
  { id: 'd-e2', title: 'Revisión de entrega · Andes Logística', h: 11, m: 0, dur: 30, join: true, att: [P('Carla Méndez', 'carla.mendez@andeslogistica.com'), P('Nico Vega', 'nico.vega@flock.example')] },
  { id: 'd-e3', title: 'Coordinación con Banco Sur', h: 14, m: 0, dur: 45, join: true, att: [P('Pablo Ríos', 'pablo.rios@bancosur.example'), P('Sofía Gil', 'sofia.gil@flock.example')] },
  { id: 'd-e4', title: 'Uno a uno con Lucía', h: 16, m: 0, dur: 30, join: false, att: [P('Lucía Paz', 'lucia.paz@flock.example')] },
  { id: 'd-e5', title: 'Uno a uno con Martín', h: 10, m: 0, dur: 30, join: false, day: 1, att: [P('Martín Ruiz', 'martin.ruiz@flock.example')] },
  { id: 'd-e6', title: 'Seguimiento del MVP · Petrolera Norte', h: 15, m: 0, dur: 45, join: true, day: 2, att: [P('Diego Sosa', 'diego.sosa@petroleranorte.com'), P('Nico Vega', 'nico.vega@flock.example')] },
];
const CONVS = [
  { key: 'slack:DEMO1', platform: 'slack', kind: 'dm', title: 'Martín Ruiz', author: 'Martín Ruiz', text: '¿Podemos hablar 10 minutos sobre las vacaciones?', ago: 50 * 60e3, needs: true, reason: 'Pide una charla breve antes de que revises su solicitud.', short: 'Responder a Martín por vacaciones' },
  { key: 'slack:CDEMO2:1700000000.1', platform: 'slack', kind: 'channel', title: '#proyecto-andes', author: 'Nico Vega', text: 'Yo diría 3 semanas mínimo entre back y front.', ago: 2 * H, needs: true, reason: 'Ya tenés la estimación; falta pasarle la fecha al cliente.', short: 'Pasar fecha estimada al cliente', thread: true },
  { key: 'teams:DEMO3', platform: 'teams', kind: 'group', title: 'Equipo Banco Sur', author: 'Pablo Ríos', text: '@Natalia ¿confirmás la reunión del jueves?', ago: 3 * H, needs: true, reason: 'Te mencionan para confirmar una reunión.', short: 'Confirmar reunión del jueves', mention: true },
  { key: 'teams:DEMO4', platform: 'teams', kind: 'dm', title: 'Lucía Paz', author: 'Vos', text: 'Perfecto, lo vemos en el uno a uno.', ago: 5 * H, needs: false, reason: 'Tu respuesta es la última.', short: null },
  { key: 'slack:CDEMO5', platform: 'slack', kind: 'channel', title: '#operaciones', author: 'Sofía Gil', text: 'Subí el reporte de indicadores del mes.', ago: 8 * H, needs: false, reason: 'Informativo.', short: null },
  { key: 'slack:DEMO6', platform: 'slack', kind: 'dm', title: 'Nico Vega', author: 'Nico Vega', text: 'Te dejé un comentario en el documento de estimación.', ago: 26 * H, needs: false, reason: null, short: null },
];
const THREADS: Record<string, { author: string; text: string; ago: number; reply?: boolean }[]> = {
  'slack:DEMO1': [{ author: 'Martín Ruiz', text: 'Hola Nati, te mandé por correo la solicitud de vacaciones.', ago: 70 * 60e3 }, { author: 'Martín Ruiz', text: '¿Podemos hablar 10 minutos sobre las vacaciones?', ago: 50 * 60e3 }],
  'slack:CDEMO2:1700000000.1': [{ author: 'Vos', text: '¿Cuándo podría estar el back office con login y ABM de usuarios?', ago: 2.2 * H }, { author: 'Nico Vega', text: 'Yo diría 3 semanas mínimo entre back y front.', ago: 2 * H, reply: true }],
  'teams:DEMO3': [{ author: 'Pablo Ríos', text: 'Les paso el presupuesto actualizado.', ago: 4 * H }, { author: 'Pablo Ríos', text: '@Natalia ¿confirmás la reunión del jueves?', ago: 3 * H }],
  'teams:DEMO4': [{ author: 'Lucía Paz', text: 'Te propongo revisar la agenda del taller en el uno a uno.', ago: 5.5 * H }, { author: 'Vos', text: 'Perfecto, lo vemos en el uno a uno.', ago: 5 * H }],
  'slack:CDEMO5': [{ author: 'Sofía Gil', text: 'Subí el reporte de indicadores del mes.', ago: 8 * H }],
  'slack:DEMO6': [{ author: 'Nico Vega', text: 'Te dejé un comentario en el documento de estimación.', ago: 26 * H }],
};

export function demoThread(key: string) {
  return (THREADS[key] || []).map((m) => ({ author: m.author, text: m.text, date: at(-m.ago), reply: !!m.reply }));
}
export function demoMailBody(id: string) {
  const m = MAIL.find((x) => x.id === id);
  return m ? `${m.preview}\n\nSaludos,\n${m.from_name}` : '';
}

export async function seedDemo(uid: string) {
  const d = db();
  await must(d.from('mail_items').upsert(MAIL.map((m) => ({
    user_id: uid, id: m.id, conversation_id: m.id, subject: m.subject, from_name: m.from_name, from_email: m.from_email, received_at: at(-m.ago),
    is_read: m.read, preview: m.preview, web_link: null, needs_reply: m.needs, attention: m.att, reason: m.reason, short_title: m.short, analyzed_at: at(0),
  }))));
  await d.from('events').delete().eq('user_id', uid);
  await must(d.from('events').insert(EVENTS.map((e) => ({
    user_id: uid, id: e.id, title: e.title, start_at: new Date(Date.parse(todayAt(e.h, e.m)) + (e.day || 0) * D).toISOString(), end_at: new Date(Date.parse(todayAt(e.h, e.m)) + (e.day || 0) * D + e.dur * 60e3).toISOString(),
    all_day: false, cancelled: false, location: e.join ? 'Reunión de Microsoft Teams' : 'Oficina', join_url: null, web_link: null, organizer: 'Demo', attendees: e.att,
  }))));
  await must(d.from('conversations').upsert(CONVS.map((c) => ({
    user_id: uid, key: c.key, platform: c.platform, kind: c.kind, title: c.title, last_id: c.key + ':last', last_author: c.author, last_text: c.text,
    last_at: at(-c.ago), link: null, mention: !!c.mention, thread: !!c.thread, participated: true, needs_reply: c.needs, reason: c.reason, short_title: c.short, analyzed_last_id: c.key + ':last',
  }))));
  const { count } = await d.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid);
  if (!count) {
    await must(d.from('tasks').insert([
      { user_id: uid, description: 'Confirmar alcance de la entrega de noviembre', project: 'Andes Logística', owner: 'Yo', due: isoDay(0), priority: 'alta', source_key: 'mail:d-m1' },
      { user_id: uid, description: 'Revisar vacaciones de Martín (16 al 27 de noviembre)', project: 'Equipo', owner: 'Yo', due: isoDay(2), priority: 'media', note: 'Completar la tarea no aprueba las vacaciones.', source_key: 'mail:d-m2' },
      { user_id: uid, description: 'Actualizar forecast del trimestre', project: 'Banco Sur', owner: 'Yo', due: isoDay(-1), priority: 'alta', status: 'en_curso' },
      { user_id: uid, description: 'Preparar agenda del taller', project: 'Equipo', owner: 'Yo', due: null, priority: 'baja' },
      { user_id: uid, description: 'Enviar feedback del MVP consolidado', project: 'Petrolera Norte', owner: 'Diego Sosa', due: isoDay(3), priority: 'media' },
    ]));
    await must(d.from('proposals').insert([
      { user_id: uid, key: 'mail:d-m6', action: 'Pasarle a Diego la fecha del próximo ajuste del MVP', project: 'Petrolera Norte', owner: 'Yo', priority: 'alta', reason: 'El cliente pidió una fecha concreta.', kind: 'respuesta', sources: [{ kind: 'email', subject: 'Feedback del MVP de proyección', from: 'Diego Sosa', date: at(-30 * H), snippet: '¿para cuándo podríamos tener el ajuste de cuellos de botella?' }] },
      { user_id: uid, key: 'mail:d-m3', action: 'Decidir si se mueve la validación al martes', project: 'Equipo', owner: 'Yo', priority: 'media', reason: 'Lucía propone cambiar la fecha.', kind: 'aprobacion', sources: [{ kind: 'email', subject: 'Propuesta de reprogramación de la validación', from: 'Lucía Paz', date: at(-5 * H), snippet: 'Propongo mover la validación del jueves al martes a las 16:30.' }] },
      { user_id: uid, key: 'conv:teams:DEMO3:x', action: 'Confirmar la reunión del jueves con Banco Sur', project: 'Banco Sur', owner: 'Yo', priority: 'media', reason: 'Te mencionaron en el chat del equipo.', kind: 'respuesta', sources: [{ kind: 'message', platform: 'teams', subject: 'Equipo Banco Sur', from: 'Pablo Ríos', date: at(-3 * H), snippet: '@Natalia ¿confirmás la reunión del jueves?' }] },
    ]));
    await d.from('person_topics').insert([
      { user_id: uid, person: 'Lucía Paz', text: 'Revisar cómo viene la carga del equipo para noviembre' },
      { user_id: uid, person: 'Martín Ruiz', text: 'Hablar de su plan de capacitación' },
    ]);
  }
  const now = at(0);
  await must(d.from('sync_state').upsert(['mail', 'calendar', 'teams', 'slack', 'analysis'].map((s) => ({
    user_id: uid, source: s, last_success_at: now, prev_success_at: at(-2 * H), last_error: null, meta: s === 'mail' ? { unread: 128, total: 3402 } : {},
  }))));
}
