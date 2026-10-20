# Flockpit

Tu correo, calendario, chats de Teams y Slack en una mesa de trabajo, con tareas, seguimientos y propuestas detectadas por Claude.

- Inicio de sesión con Microsoft: la app pide los permisos al conectarte.
- Conexión de Slack con su propia pantalla de permisos.
- Sincronización cada 10 minutos, también con la app cerrada.
- Solo lectura: Flockpit no envía correos ni mensajes.

## Qué vas a necesitar

| Servicio | Para qué | Costo para empezar |
|---|---|---|
| GitHub | Guardar el código y programar la sincronización | Gratis |
| Supabase | Base de datos | Plan gratuito |
| Vercel | Publicar la app | Plan gratuito |
| Microsoft Entra | Registrar la app para el inicio de sesión | Incluido en Microsoft 365 |
| Slack | Crear la app de Slack | Gratis |
| Anthropic (opcional) | Análisis automático con Claude | Pago por uso |

Tiempo estimado: una hora la primera vez.

---

## Paso 1 · Subir el código a GitHub

1. Creá un repositorio **privado** en GitHub, por ejemplo `flockpit`.
2. Subí el contenido de esta carpeta. El archivo `data/flockpit-export.json` tiene tus tareas y está excluido en `.gitignore`: no se sube.

```bash
git init
git add .
git commit -m "Flockpit inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/flockpit.git
git push -u origin main
```

## Paso 2 · Crear la base de datos en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto nuevo.
2. Abrí **SQL Editor**, pegá el contenido de `supabase/schema.sql` y tocá **Run**.
3. En **Project Settings → API** copiá:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` (secreta) → `SUPABASE_SERVICE_ROLE_KEY`

La clave `service_role` solo se usa en el servidor. Nunca la pongas en el navegador ni en el repositorio.

## Paso 3 · Publicar en Vercel (primera vez)

1. En [vercel.com](https://vercel.com) tocá **Add New → Project** e importá el repositorio.
2. Antes de desplegar, cargá las variables de `.env.example` que ya tengas. Las de Microsoft y Slack las completás en los pasos 4 y 5.
3. Desplegá. Anotá la URL, por ejemplo `https://flockpit.vercel.app`, y cargala como `APP_URL`.

Para generar `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` y `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Corré el comando tres veces y usá un valor distinto para cada variable.

## Paso 4 · Registrar la app en Microsoft Entra

1. Entrá a [entra.microsoft.com](https://entra.microsoft.com) → **Applications → App registrations → New registration**.
2. Nombre: `Flockpit`.
3. Tipos de cuenta: **Solo cuentas de este directorio organizativo** (solo Flock).
4. URI de redirección: plataforma **Web**, valor `https://TU-DOMINIO/api/auth/microsoft/callback`. Agregá también `http://localhost:3000/api/auth/microsoft/callback` para probar en tu computadora.
5. Registrá y copiá:
   - **Application (client) ID** → `MS_CLIENT_ID`
   - **Directory (tenant) ID** → `MS_TENANT_ID`
6. En **Certificates & secrets → New client secret**, copiá el **Value** → `MS_CLIENT_SECRET`. Anotá cuándo vence para renovarlo.
7. En **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, agregá: `User.Read`, `Mail.Read`, `Calendars.Read`, `Chat.Read`, `offline_access`, `openid`, `profile`, `email`.

No hace falta tocar **Grant admin consent**: cada persona acepta sus permisos al iniciar sesión. Si Flock no permite que los usuarios acepten permisos, al iniciar sesión vas a ver «Necesita aprobación del administrador» con un botón para pedirla.

## Paso 5 · Crear la app de Slack

1. Abrí `slack-app-manifest.yml` y reemplazá `TU-DOMINIO` por tu URL de Vercel.
2. En [api.slack.com/apps](https://api.slack.com/apps) tocá **Create New App → From a manifest**, elegí el workspace de Flock y pegá el manifiesto.
3. En **Basic Information** copiá **Client ID** → `SLACK_CLIENT_ID` y **Client Secret** → `SLACK_CLIENT_SECRET`.

Si el workspace exige aprobación de apps, Slack te muestra «Solicitar instalación» al conectar.

## Paso 6 · Análisis con Claude (opcional)

1. Creá una clave en [console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY`.
2. `ANTHROPIC_MODEL` viene con `claude-sonnet-5-5`. Podés cambiarlo por otro modelo disponible en tu cuenta.

Sin esta clave, la app sincroniza todo igual, pero no marca qué requiere respuesta ni propone tareas.

## Paso 7 · Volver a desplegar y entrar

1. En Vercel, completá todas las variables y tocá **Redeploy**.
2. Abrí tu URL y tocá **Iniciar sesión con Microsoft**. Aceptá los permisos.
3. En **Ajustes y conexiones**, tocá **Conectar** en Slack y aceptá los permisos.
4. En la misma pantalla, en **Importar datos de Flockpit en Claude**, subí `data/flockpit-export.json`. Trae tus tareas, notas y propuestas.

## Paso 8 · Sincronización con la app cerrada

El plan gratuito de Vercel solo permite tareas programadas una vez por día, así que la sincronización frecuente la hace GitHub Actions:

1. En GitHub → **Settings → Secrets and variables → Actions → New repository secret**, creá:
   - `FLOCKPIT_URL`: tu URL de Vercel
   - `CRON_SECRET`: el mismo valor que cargaste en Vercel
2. El archivo `.github/workflows/sync.yml` llama a la sincronización cada 10 minutos, de lunes a viernes entre las 7 y las 20 h de Argentina. Podés cambiar el horario ahí.
3. Para probarlo: **Actions → Sincronizar Flockpit → Run workflow**.

Mientras la app está abierta, además se actualiza sola cada 10 minutos.

---

## Probar en tu computadora

```bash
cp .env.example .env.local   # completá los valores, con APP_URL=http://localhost:3000
npm install
npm run dev
```

Abrí `http://localhost:3000`.

## Cómo está armada

```
src/app/page.tsx                 Mi día
src/components/Workspace.tsx     Interfaz: agenda, correo, mensajes, pendientes y paneles
src/app/api/auth/microsoft       Inicio de sesión y permisos de Microsoft
src/app/api/connect/slack        Conexión y permisos de Slack
src/app/api/sync                 Actualización manual y automática
src/app/api/cron/sync            Sincronización programada (con la app cerrada)
src/lib/sync.ts                  Lectura de correo, calendario, Teams y Slack
src/lib/analyze.ts               Clasificación y propuestas con Claude
supabase/schema.sql              Tablas
```

**Seguridad:**
- Los tokens de Microsoft y Slack se guardan cifrados (AES-256-GCM) con `TOKEN_ENCRYPTION_KEY`.
- Cada consulta filtra por el usuario de la sesión.
- La base tiene RLS activo y solo el servidor accede.

## Próximas etapas

- **Canales de Teams y transcripciones de reuniones:** requieren permisos que aprueba el administrador (`ChannelMessage.Read.All`, `OnlineMeetingTranscript.Read.All`) y habilitar la política de transcripciones.
- **Fathom:** conexión con su API para procesar reuniones.
- **Avisos en tiempo real:** suscripciones de Microsoft Graph y Slack Events, en lugar de consultar cada 10 minutos.
- **Más usuarios:** ya está preparada. Cada persona inicia sesión con su cuenta de Flock y ve solo lo suyo.
