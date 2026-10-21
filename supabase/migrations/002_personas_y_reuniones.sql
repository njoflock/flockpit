-- Flockpit · actualización 2: participantes de reuniones y temas por persona.
-- Ejecutalo una vez en Supabase > SQL Editor.
alter table events add column if not exists attendees jsonb default '[]'::jsonb;

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
