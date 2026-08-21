-- Habit tracker schema: seasons, habits, logs, pets, titles.
-- Run this once in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- seasons: shared reference data, same for every user. Not owned by a user_id.
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

alter table seasons enable row level security;

create policy "seasons are readable by any logged-in user"
  on seasons for select
  to authenticated
  using (true);

insert into seasons (name, start_date, end_date) values
  ('Spring 2026', '2026-03-20', '2026-06-20'),
  ('Summer 2026', '2026-06-21', '2026-09-22'),
  ('Fall 2026',   '2026-09-23', '2026-12-20'),
  ('Winter 2026', '2026-12-21', '2027-03-19'),
  ('Spring 2027', '2027-03-20', '2027-06-20'),
  ('Summer 2027', '2027-06-21', '2027-09-22'),
  ('Fall 2027',   '2027-09-23', '2027-12-20'),
  ('Winter 2027', '2027-12-21', '2028-03-19')
on conflict do nothing;

-- habits
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  position integer not null default 0,
  season_id uuid references seasons (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists habits_user_id_idx on habits (user_id);

alter table habits enable row level security;

create policy "users manage their own habits"
  on habits for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- logs: one row per habit per day
create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references habits (id) on delete cascade,
  log_date date not null,
  done boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index if not exists logs_user_id_log_date_idx on logs (user_id, log_date);

alter table logs enable row level security;

create policy "users manage their own logs"
  on logs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- pets: one pixel-cat companion per user. Mood/expression is computed at
-- read time from recent logs, not stored. display_expression is a planned
-- future column — not added yet.
create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  name text not null,
  created_at timestamptz not null default now()
);

alter table pets enable row level security;

create policy "users manage their own pet"
  on pets for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- titles: earned recap titles per week or season
create table if not exists titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_type text not null check (period_type in ('week', 'season')),
  period_start date not null,
  period_end date not null,
  title_text text not null,
  stats_json jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);

alter table titles enable row level security;

create policy "users manage their own titles"
  on titles for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
