-- Release notes. Published by hand through the Supabase SQL editor (see
-- the publish snippet in the app's notes, not in this migration — there's
-- nothing to migrate about an individual release) — the app itself never
-- writes a row here, so there's deliberately no insert/update/delete
-- policy for any role, only read.
create table releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  released_at date not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table releases enable row level security;

create policy "authenticated users can read releases"
  on releases for select
  to authenticated
  using (true);

-- Per-user "last release I've acknowledged." A user manages their own row
-- directly (same shape as pets' "for all, user_id = auth.uid()" policy) —
-- no function needed, since there's no cross-user invariant to protect
-- here, just "dismiss my own notice."
create table user_release_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_release_id uuid not null references releases (id),
  updated_at timestamptz not null default now()
);

alter table user_release_state enable row level security;

create policy "users manage their own release state"
  on user_release_state for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
