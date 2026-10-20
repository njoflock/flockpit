# Contexto para Claude Code

Flockpit es una app personal (escalable a más usuarios de Flock) que reúne correo, calendario, chats de Teams y Slack.

## Stack
Next.js 14 (App Router, TypeScript), Supabase (Postgres, solo desde el servidor con service role), Vercel, Microsoft Graph (OAuth delegado), Slack (OAuth con user token), Anthropic SDK.

## Reglas del producto
- Solo lectura: nunca enviar correos ni mensajes.
- No inventar responsables ni fechas en tareas o propuestas.
- Distinguir siempre: «Sin leer en la fuente» (solo correo), «Nuevo desde la sincronización» y «Revisado en Flockpit».
- Las propuestas descartadas o confirmadas no se vuelven a crear (clave única por usuario).
- Todo dato pertenece a un usuario (`user_id`); filtrar siempre por la sesión.
- Interfaz en español rioplatense (voseo), tono claro y breve.

## Diseño
Fondo blanco, lavanda tenue en Correo, acentos magenta (#E5177E) para acciones y violeta (#6A2BD9) para navegación.
Títulos de sector 19 px, contenido 15 px, filas de 72–80 px, avatares de 32 px.
Correo y Mensajes con alto fijo (380 px) y desplazamiento interno; la bandeja de pendientes debajo.

## Próximas tareas sugeridas
1. Agrupar correos por tema y cargar más resultados con paginación de Graph (`@odata.nextLink`).
2. Canales de Teams y transcripciones (requieren aprobación del administrador).
3. Integración con Fathom.
4. Suscripciones de Graph y Slack Events para avisos en tiempo real.
5. Tests de las rutas de API y de `sync.ts`.
