-- Clowder detail page rework: the new per-member progress ring needs the
-- raw trailing-7-day completion rate, not just the four-bucket mood word,
-- and leadership — derived from clowders.created_by, falling back to the
-- longest-standing remaining member if the creator has left — needs to be
-- computable both for display (the crown) and for enforcement (only the
-- leader can rename). No new columns: both are computed live from
-- existing data, same principle as everything else in Clowders.
--
-- Wrapped in an explicit transaction: get_my_clowder_summary's OUT-param
-- row type changes (trailing_rate/is_leader added, logged_today/
-- current_streak dropped), and Postgres refuses to CREATE OR REPLACE a
-- function across a return-type change — it has to be dropped and
-- recreated instead. That drop also drops its grants. BEGIN/COMMIT here
-- isn't just for the same guarantee the previous migrations already got
-- implicitly by being run as one script — it makes explicit that no
-- session can observe the function mid-swap (dropped but not yet
-- recreated, or recreated but not yet re-granted) even under concurrent
-- access, and everything still rolls back together on any failure.
begin;

-- Extracted from _clowder_mood_expression's core loop so the raw rate is
-- available on its own. Returns null (not 0) for a member with zero active
-- habits — distinct from "has habits, did none of them" — so callers can
-- tell the two apart, same distinction _clowder_mood_expression already
-- made before this refactor (a zero-habit member shows as content, not
-- scruffy).
create or replace function _clowder_trailing_rate(target_user_id uuid, as_of date)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  habit record;
  total numeric := 0;
  habit_count int := 0;
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
    return null;
  end if;

  return total / habit_count;
end;
$$;

revoke all on function _clowder_trailing_rate(uuid, date) from public, anon, authenticated;

-- Re-defined to call the extracted rate function instead of duplicating
-- the loop. Behavior is unchanged — same thresholds, same grace-period
-- floor, same zero-habit special case, just sourced from one place now.
-- Signature (uuid, date) -> text is unchanged from the original, so
-- CREATE OR REPLACE is fine here — only get_my_clowder_summary's row type
-- actually changed.
create or replace function _clowder_mood_expression(target_user_id uuid, as_of date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  rate numeric;
  mood text;
  account_created date;
begin
  rate := public._clowder_trailing_rate(target_user_id, as_of);

  if rate is null then
    return 'content';
  end if;

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

revoke all on function _clowder_mood_expression(uuid, date) from public, anon, authenticated;

-- The clowder's leader: whoever created it, unless they've since left, in
-- which case leadership passes to whoever has been a member longest.
-- Deliberately not a stored column — always computed live from
-- clowders.created_by and clowder_members.joined_at, so there's nothing to
-- keep in sync when someone leaves. Not meant to be called directly (same
-- shape as the other private helpers below get_my_clowder_summary) —
-- authorization for actual leader-only writes lives in the functions that
-- call this, not here.
create or replace function _clowder_leader(target_clowder_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  leader_id uuid;
begin
  select c.created_by into leader_id
  from public.clowders c
  where c.id = target_clowder_id
    and exists (
      select 1 from public.clowder_members cm
      where cm.clowder_id = target_clowder_id and cm.user_id = c.created_by
    );

  if leader_id is null then
    select cm.user_id into leader_id
    from public.clowder_members cm
    where cm.clowder_id = target_clowder_id
    order by cm.joined_at asc
    limit 1;
  end if;

  return leader_id;
end;
$$;

revoke all on function _clowder_leader(uuid) from public, anon, authenticated;

-- Adds trailing_rate (for the ring) and is_leader (for the crown and the
-- settings-button gate), drops logged_today and current_streak — the
-- redesigned member card doesn't show either. This is a row-type change,
-- not just a body change, so CREATE OR REPLACE can't do it — Postgres
-- rejects altering the OUT-parameter shape of an existing function that
-- way. Drop and recreate instead, then re-grant: the drop takes the old
-- function's grants with it.
drop function get_my_clowder_summary();

create function get_my_clowder_summary()
returns table (
  clowder_id uuid,
  clowder_name text,
  invite_code text,
  user_id uuid,
  username text,
  cat_name text,
  expression text,
  trailing_rate numeric,
  is_leader boolean,
  is_you boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := current_date;
begin
  return query
  select
    c.id as clowder_id,
    c.name as clowder_name,
    c.invite_code,
    m.user_id,
    coalesce(u.raw_user_meta_data->>'username', 'unknown') as username,
    coalesce(p.name, 'their cat') as cat_name,
    public._clowder_mood_expression(m.user_id, today) as expression,
    coalesce(public._clowder_trailing_rate(m.user_id, today), 0) as trailing_rate,
    (m.user_id = public._clowder_leader(c.id)) as is_leader,
    (m.user_id = auth.uid()) as is_you
  from public.clowder_members m
  join public.clowders c on c.id = m.clowder_id
  left join auth.users u on u.id = m.user_id
  left join public.pets p on p.user_id = m.user_id
  where m.clowder_id in (
    select cm.clowder_id from public.clowder_members cm where cm.user_id = auth.uid()
  )
  order by c.created_at asc, m.joined_at asc;
end;
$$;

revoke all on function get_my_clowder_summary() from public, anon, authenticated;
grant execute on function get_my_clowder_summary() to authenticated;

-- No longer called by anything now that get_my_clowder_summary drops
-- current_streak from its output (the redesigned member card doesn't show
-- one) — removed rather than left dormant. Dropped after the redefinition
-- above, once nothing references it anymore, not that Postgres actually
-- requires that ordering (a PL/pgSQL body's internal calls aren't checked
-- against callee signatures until execution, so this wasn't the thing
-- causing the original error) — just tidier to read top to bottom.
drop function if exists _clowder_best_streak(uuid, date);

-- Only the current leader (see _clowder_leader above) may rename a
-- clowder. Enforced here, not just by hiding the settings button — a
-- direct RPC call from a non-leader must fail the same way. Same
-- confirm-the-write shape as every other mutating function in this
-- migration set: checks the row actually changed, not just that no error
-- was raised. New function, no prior signature to conflict with, so
-- CREATE OR REPLACE is fine.
create or replace function rename_clowder(target_clowder_id uuid, new_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := trim(new_name);
  affected int;
begin
  if public._clowder_leader(target_clowder_id) is distinct from auth.uid() then
    raise exception 'only the clowder leader can do that';
  end if;

  if cleaned_name is null or cleaned_name = '' then
    raise exception 'clowder name is required';
  end if;
  if char_length(cleaned_name) > 40 then
    raise exception 'clowder name is too long';
  end if;

  update public.clowders set name = cleaned_name where id = target_clowder_id;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'clowder not found';
  end if;

  return cleaned_name;
end;
$$;

revoke all on function rename_clowder(uuid, text) from public, anon, authenticated;
grant execute on function rename_clowder(uuid, text) to authenticated;

commit;
