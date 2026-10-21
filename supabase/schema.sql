-- Flockpit: esquema inicial. Ejecutalo en Supabase > SQL Editor.
-- Todo el acceso pasa por el servidor con la service role key; RLS activo y sin políticas
-- públicas impide que un navegador lea las tablas directamente.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  ms_oid text unique not null,
  email text not null,
  name text,
  created_at timestamptz default now()
);

create table if not exists connections (
  user_id uuid references users(id) on delete cascade,
  provider text not null check (provider in ('microsoft','slack')),
  external_user_id text,
  team_id text,
  scopes text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  status text default 'ok',
  last_error text,
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

create table if not exists sync_state (
  user_id uuid references users(id) on delete cascade,
  source text not null check (source in ('mail','calendar','teams','slack','analysis')),
  last_success_at timestamptz,
  prev_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  meta jsonb default '{}'::jsonb,
  primary key (user_id, source)
);

create table if not exists mail_items (
  user_id uuid references users(id) on delete cascade,
  id text not null,
  conversation_id text,
  subject text,
  from_name text,
  from_email text,
  received_at timestamptz,
  is_read boolean,
  preview text,
  web_link text,
  needs_reply boolean,
  attention text,
  reason text,
  short_title text,
  topic text,
  analyzed_at timestamptz,
  updated_at timestamptz default now(),
  primary key (user_id, id)
);
create index if not exists mail_items_recent on mail_items(user_id, received_at desc);

create table if not exists events (
  user_id uuid references users(id) on delete cascade,
  id text not null,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean default false,
  cancelled boolean default false,
  location text,
  join_url text,
  web_link text,
  organizer text,
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

create table if not exists conversations (
  user_id uuid references users(id) on delete cascade,
  key text not null,
  platform text not null check (platform in ('teams','slack')),
  kind text,
  title text,
  last_id text,
  last_author text,
  last_text text,
  last_at timestamptz,
  link text,
  mention boolean default false,
  thread boolean default false,
  reply_count int,
  participated boolean default false,
  needs_reply boolean,
  reason text,
  short_title text,
  analyzed_last_id text,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);
create index if not exists conversations_recent on conversations(user_id, last_at desc);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  description text not null,
  project text default 'Sin proyecto',
  owner text default 'Yo',
  due date,
  priority text default 'media' check (priority in ('alta','media','baja')),
  status text default 'pendiente' check (status in ('pendiente','en_curso','bloqueada','completada')),
  note text default '',
  source_key text,
  sources jsonb default '[]'::jsonb,
  event_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  done_at timestamptz
);
create index if not exists tasks_user on tasks(user_id, status);
create unique index if not exists tasks_source_key on tasks(user_id, source_key) where source_key is not null;

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  key text not null,
  action text not null,
  project text,
  owner text,
  due date,
  priority text default 'media',
  reason text,
  kind text,
  sources jsonb default '[]'::jsonb,
  status text default 'open' check (status in ('open','confirmed','dismissed')),
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz default now(),
  unique (user_id, key)
);

create table if not exists reviews (
  user_id uuid references users(id) on delete cascade,
  item_key text not null,
  last_id text,
  reviewed_at timestamptz default now(),
  primary key (user_id, item_key)
);

alter table users enable row level security;
alter table connections enable row level security;
alter table sync_state enable row level security;
alter table mail_items enable row level security;
alter table events enable row level security;
alter table conversations enable row level security;
alter table tasks enable row level security;
alter table proposals enable row level security;
alter table reviews enable row level security;

create table if not exists person_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  person text not null,
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);
create index if not exists person_topics_user on person_topics(user_id, person);
alter table person_topics enable row level security;
