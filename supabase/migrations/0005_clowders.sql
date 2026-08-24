-- Clowders: small cooperative friend groups. First feature where one user
-- can see derived facts about another. habits/logs/pets policies are NOT
-- touched by this migration — cross-user reads never go through their RLS
-- at all, only through the SECURITY DEFINER functions below, which bypass
-- RLS internally (that's what SECURITY DEFINER is for) and return a narrow,
-- pre-reduced set of fields. A direct REST query against habits/logs/pets
-- for another user's rows still returns nothing, clowder or not.
--
-- Every SECURITY DEFINER function here sets search_path = '' and
-- schema-qualifies every reference (public.x, auth.users). Without that, a
-- caller able to create objects in a schema earlier in the search path
-- could hijack an unqualified reference inside a function running with
-- elevated privilege — this is Supabase's own linter recommendation.

create table clowders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  constraint clowders_name_check check (char_length(trim(name)) between 1 and 40)
);

alter table clowders enable row level security;
-- Deliberately no policies at all: clowders is unreachable via direct API
-- reads or writes for every role. All access is mediated by the functions
-- below, which run as their owner and bypass RLS entirely.

create table clowder_members (
  id uuid primary key default gen_random_uuid(),
  clowder_id uuid not null references clowders (id) on delete cascade,
  -- unique (not unique(clowder_id, user_id)) — this is what makes "one
  -- clowder at a time" a database guarantee, not an app-level convention.
  user_id uuid not null references auth.users (id) on delete cascade unique,
  joined_at timestamptz not null default now()
);

create index clowder_members_clowder_id_idx on clowder_members (clowder_id);

alter table clowder_members enable row level security;

create policy "members can leave their own clowder"
  on clowder_members for delete
  to authenticated
  using (user_id = auth.uid());
-- No select/insert/update policy: reads go through get_my_clowder_summary(),
-- creation through create_clowder(), joining through
-- join_clowder_by_invite_code() — all three run as their owner and bypass
-- RLS, so the 8-member cap, one-clowder-per-user, and invite-code lookup
-- all live in one auditable place instead of being split across policies a
-- client could otherwise satisfy directly with a raw insert.

create table clowder_nudges (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  nudge_date date not null,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id, nudge_date)
);

alter table clowder_nudges enable row level security;

create policy "clowder members can read nudges involving them"
  on clowder_nudges for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- Nudges don't expose anything private about the target (no habit data,
-- just "a ping happened"), so this is plain RLS rather than a function for
-- the write itself — but the shared-membership check below still can't be
-- a raw subquery against clowder_members, because that table has no SELECT
-- policy at all (by design, it's function-mediated-only). A policy's USING
-- / WITH CHECK evaluates as the calling user, so an inline subquery there
-- would see zero rows regardless of the real membership — not an error,
-- just a predicate that can never pass. _shares_clowder() exists purely to
-- give this one check a way to read clowder_members despite that.
create or replace function _shares_clowder(other_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.clowder_members cm1
    join public.clowder_members cm2 on cm1.clowder_id = cm2.clowder_id
    where cm1.user_id = auth.uid()
      and cm2.user_id = other_user_id
  );
end;
$$;

-- Unlike the other two helpers, this one IS meant to be called directly —
-- RLS policies run as the calling user, not as an elevated role, so
-- "authenticated" needs EXECUTE for the policy below to work at all. It's
-- safe to expose: the only thing it reveals is a boolean "do we share a
-- clowder," which nudging and the member summary already make obvious.
revoke all on function _shares_clowder(uuid) from public, anon;
grant execute on function _shares_clowder(uuid) to authenticated;

create policy "members can nudge a fellow clowder member once a day"
  on clowder_nudges for insert
  to authenticated
  with check (
    from_user_id = auth.uid()
    and _shares_clowder(to_user_id)
  );

create policy "recipients can mark their nudges seen"
  on clowder_nudges for update
  to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

-- The row-level policy above would otherwise let a recipient PATCH any
-- column on a nudge addressed to them, including from_user_id (relabeling
-- who it says nudged them). The column-level grant restricts that
-- regardless of what the row-level policy allows.
revoke update on clowder_nudges from authenticated;
grant update (seen_at) on clowder_nudges to authenticated;

-- ---------------------------------------------------------------------
-- Invite code generator. No table access, so search_path is low-stakes
-- here, but hardened anyway for consistency — it still executes inside
-- the elevated context of the SECURITY DEFINER functions that call it.
-- ---------------------------------------------------------------------
create or replace function generate_invite_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return code;
end;
$$;

revoke all on function generate_invite_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Private helpers — bypass RLS to read another user's habits/logs, but
-- take a bare target_user_id with NO authorization check of their own.
-- The authorization lives entirely in get_my_clowder_summary(), which is
-- the only thing allowed to call these. Revoked from public below;
-- calling either directly via RPC must fail regardless of who asks.
-- ---------------------------------------------------------------------

-- Mirrors CatSprite's moodFromCompletion + HomeDashboard's grace-period
-- floor exactly — a clowder-mate's expression is their trailing-7-day
-- mood, nothing else. Deliberately does NOT port the "momentary" overlay
-- (blep, excited-if-all-done, sleepy-by-hour) — those are flourishes tied
-- to the viewer's own clock or a random roll, not stable facts about
-- someone else.
create or replace function _clowder_mood_expression(target_user_id uuid, as_of date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  habit record;
  total numeric := 0;
  habit_count int := 0;
  rate numeric;
  mood text;
  account_created date;
  trailing_start date := as_of - 6;
  done_count int;
  contribution numeric;
begin
  for habit in
    select h.id, h.target_type, h.target_count
    from public.habits h
    where h.user_id = target_user_id and h.archived = false
  loop
    habit_count := habit_count + 1;

    select count(*) into done_count
    from public.logs l
    where l.habit_id = habit.id
      and l.done = true
      and l.log_date between trailing_start and as_of;

    if habit.target_type = 'weekly' then
      contribution := least(1.0, done_count::numeric / habit.target_count);
    else
      contribution := done_count::numeric / 7.0;
    end if;

    total := total + contribution;
  end loop;

  if habit_count = 0 then
    return 'content';
  end if;

  rate := total / habit_count;

  if rate >= 0.8 then
    mood := 'happy';
  elsif rate >= 0.5 then
    mood := 'content';
  elsif rate >= 0.25 then
    mood := 'restless';
  else
    mood := 'scruffy';
  end if;

  select u.created_at::date into account_created from auth.users u where u.id = target_user_id;

  if account_created is not null
    and (as_of - account_created) < 7
    and mood in ('restless', 'scruffy')
  then
    return 'content';
  end if;

  return mood;
end;
$$;

-- Revoking from PUBLIC alone is not enough — Supabase provisions new
-- projects with `alter default privileges in schema public grant execute
-- on functions to authenticated`, which grants EXECUTE to authenticated
-- directly at creation time, separately from whatever PUBLIC has. Revoking
-- from PUBLIC doesn't touch that separate grant, so it must be revoked
-- explicitly too — confirmed by testing: without this, authenticated could
-- call this helper directly and get a real computed result back.
revoke all on function _clowder_mood_expression(uuid, date) from public, anon, authenticated;

-- Same walk-backward algorithm as HomeDashboard's computeDailyStreak /
-- computeWeeklyStreak (counts from yesterday if today isn't logged yet),
-- scoped to active habits, taking the max across all of them — same "one
-- number, whichever habit produced it" approach the season recap already
-- uses, just without needing to name the habit here.
create or replace function _clowder_best_streak(target_user_id uuid, as_of date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  habit record;
  best int := 0;
  streak int;
  cursor_date date;
  week_start date;
  done_count int;
  i int;
begin
  for habit in
    select h.id, h.target_type, h.target_count
    from public.habits h
    where h.user_id = target_user_id and h.archived = false
  loop
    streak := 0;

    if habit.target_type = 'weekly' then
      week_start := as_of - extract(dow from as_of)::int;

      select count(*) into done_count
      from public.logs
      where habit_id = habit.id and done = true
        and log_date between week_start and week_start + 6;

      if done_count >= habit.target_count then
        streak := streak + 1;
      end if;
      week_start := week_start - 7;

      for i in 1..104 loop
        select count(*) into done_count
        from public.logs
        where habit_id = habit.id and done = true
          and log_date between week_start and week_start + 6;

        exit when done_count < habit.target_count;
        streak := streak + 1;
        week_start := week_start - 7;
      end loop;
    else
      cursor_date := as_of;
      if not exists (
        select 1 from public.logs
        where habit_id = habit.id and log_date = cursor_date and done = true
      ) then
        cursor_date := cursor_date - 1;
      end if;

      for i in 1..400 loop
        exit when not exists (
          select 1 from public.logs
          where habit_id = habit.id and log_date = cursor_date and done = true
        );
        streak := streak + 1;
        cursor_date := cursor_date - 1;
      end loop;
    end if;

    if streak > best then
      best := streak;
    end if;
  end loop;

  return best;
end;
$$;

-- Same default-privilege gap as _clowder_mood_expression above.
revoke all on function _clowder_best_streak(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Public RPCs. Each revokes from public first, then grants only to
-- authenticated — by default Postgres grants EXECUTE on a new function to
-- PUBLIC, which would otherwise include anon.
-- ---------------------------------------------------------------------

create or replace function create_clowder(clowder_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  cleaned_name text := trim(clowder_name);
  new_code text;
  attempt int := 0;
begin
  if cleaned_name is null or cleaned_name = '' then
    raise exception 'clowder name is required';
  end if;
  if char_length(cleaned_name) > 40 then
    raise exception 'clowder name is too long';
  end if;

  if exists (select 1 from public.clowder_members where user_id = auth.uid()) then
    raise exception 'already in a clowder';
  end if;

  loop
    new_code := public.generate_invite_code();
    exit when not exists (select 1 from public.clowders where invite_code = new_code);
    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'could not generate a unique invite code, try again';
    end if;
  end loop;

  insert into public.clowders (created_by, name, invite_code)
  values (auth.uid(), cleaned_name, new_code)
  returning id into new_id;

  insert into public.clowder_members (clowder_id, user_id)
  values (new_id, auth.uid());

  return new_id;
end;
$$;

revoke all on function create_clowder(text) from public, anon, authenticated;
grant execute on function create_clowder(text) to authenticated;

create or replace function join_clowder_by_invite_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  member_count int;
  normalized_code text := upper(trim(code));
begin
  if exists (select 1 from public.clowder_members where user_id = auth.uid()) then
    raise exception 'already in a clowder';
  end if;

  -- Locks the clowders row for the duration of the check-and-insert below,
  -- so two people joining the same near-full clowder at the same instant
  -- can't both read "7 members" and both succeed, landing at 9.
  select id into target_id
  from public.clowders
  where invite_code = normalized_code
  for update;

  if target_id is null then
    raise exception 'invalid invite code';
  end if;

  select count(*) into member_count
  from public.clowder_members
  where clowder_id = target_id;

  if member_count >= 8 then
    raise exception 'that clowder is full';
  end if;

  insert into public.clowder_members (clowder_id, user_id)
  values (target_id, auth.uid());

  return target_id;
end;
$$;

revoke all on function join_clowder_by_invite_code(text) from public, anon, authenticated;
grant execute on function join_clowder_by_invite_code(text) to authenticated;

create or replace function regenerate_clowder_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clowder_id uuid;
  new_code text;
  attempt int := 0;
begin
  select clowder_id into target_clowder_id
  from public.clowder_members
  where user_id = auth.uid();

  if target_clowder_id is null then
    raise exception 'not in a clowder';
  end if;

  loop
    new_code := public.generate_invite_code();
    exit when not exists (select 1 from public.clowders where invite_code = new_code);
    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'could not generate a unique invite code, try again';
    end if;
  end loop;

  update public.clowders set invite_code = new_code where id = target_clowder_id;

  return new_code;
end;
$$;

revoke all on function regenerate_clowder_invite_code() from public, anon, authenticated;
grant execute on function regenerate_clowder_invite_code() to authenticated;

create or replace function get_my_clowder_summary()
returns table (
  clowder_id uuid,
  clowder_name text,
  invite_code text,
  user_id uuid,
  username text,
  cat_name text,
  expression text,
  logged_today boolean,
  current_streak integer,
  is_you boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_clowder_id uuid;
  today date := current_date;
begin
  select cm.clowder_id into my_clowder_id
  from public.clowder_members cm
  where cm.user_id = auth.uid();

  if my_clowder_id is null then
    return;
  end if;

  return query
  select
    c.id as clowder_id,
    c.name as clowder_name,
    c.invite_code,
    m.user_id,
    coalesce(u.raw_user_meta_data->>'username', 'unknown') as username,
    coalesce(p.name, 'their cat') as cat_name,
    public._clowder_mood_expression(m.user_id, today) as expression,
    exists (
      select 1 from public.logs l
      where l.user_id = m.user_id and l.log_date = today and l.done = true
    ) as logged_today,
    public._clowder_best_streak(m.user_id, today) as current_streak,
    (m.user_id = auth.uid()) as is_you
  from public.clowder_members m
  join public.clowders c on c.id = m.clowder_id
  left join auth.users u on u.id = m.user_id
  left join public.pets p on p.user_id = m.user_id
  where m.clowder_id = my_clowder_id
  order by m.joined_at asc;
end;
$$;

revoke all on function get_my_clowder_summary() from public, anon, authenticated;
grant execute on function get_my_clowder_summary() to authenticated;

-- Nudges are shown on Home as "{username} nudged you" — auth.users isn't
-- reachable from the client at all (not an RLS restriction, PostgREST
-- doesn't expose that schema regardless), so resolving the sender's
-- username needs the same function-mediated approach as everything else.
create or replace function get_my_unseen_nudges()
returns table (
  nudge_id uuid,
  from_user_id uuid,
  from_username text,
  nudge_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    n.id as nudge_id,
    n.from_user_id,
    coalesce(u.raw_user_meta_data->>'username', 'someone') as from_username,
    n.nudge_date
  from public.clowder_nudges n
  left join auth.users u on u.id = n.from_user_id
  where n.to_user_id = auth.uid() and n.seen_at is null
  order by n.created_at desc;
end;
$$;

revoke all on function get_my_unseen_nudges() from public, anon, authenticated;
grant execute on function get_my_unseen_nudges() to authenticated;

-- ---------------------------------------------------------------------
-- Empty-clowder cleanup. Leaving stays a plain client-side DELETE
-- (clowder_members' policy above) — this trigger is what deletes the
-- orphaned clowders row so its invite code can't be joined into an empty
-- group forever. SECURITY DEFINER because the leaving user has no direct
-- grant to delete from clowders (it has no policies at all).
-- ---------------------------------------------------------------------
create or replace function cleanup_empty_clowder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.clowder_members where clowder_id = old.clowder_id) then
    delete from public.clowders where id = old.clowder_id;
  end if;
  return old;
end;
$$;

create trigger clowder_members_after_delete
  after delete on clowder_members
  for each row execute function cleanup_empty_clowder();
