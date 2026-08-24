-- People can now belong to multiple clowders (friends, family, etc.)
-- instead of just one. This replaces the core invariant clowder_members
-- relied on, so every function that assumed "one clowder per user" needed
-- revisiting — see each function below for what changed and why.
--
-- _shares_clowder is NOT redefined here: it already checks for any shared
-- clowder_id between two members (no "only one clowder" assumption was
-- ever baked into it), so multi-membership doesn't change its behavior.

alter table clowder_members drop constraint clowder_members_user_id_key;
alter table clowder_members
  add constraint clowder_members_clowder_id_user_id_key unique (clowder_id, user_id);

-- unique(clowder_id, user_id) creates a composite index led by clowder_id,
-- which doesn't efficiently serve "how many clowders is this user in" /
-- "all of this user's clowders" lookups (the 5-clowder cap check, and
-- get_my_clowder_summary's own scoping). Needs its own index now that
-- user_id alone is no longer uniquely indexed.
create index clowder_members_user_id_idx on clowder_members (user_id);

-- Found by testing "leave," which this migration is the first thing to
-- actually exercise (leave was never tested against 0005 either, so this
-- bug predates multi-clowder support — it just took scoping leave to one
-- specific clowder to finally trigger a real test of it).
--
-- clowder_members intentionally has no SELECT policy — reads go through
-- get_my_clowder_summary(), which bypasses RLS as SECURITY DEFINER. But
-- DELETE (and UPDATE) need to see a row via SELECT-level visibility before
-- they can act on it, separate from whatever the DELETE policy's own USING
-- clause allows. With zero SELECT policy, every row was invisible for that
-- purpose, so "leave" silently matched and deleted nothing — no error, just
-- a no-op. This SELECT policy is what the delete policy already implied
-- was safe to see (your own membership rows only), so it doesn't loosen
-- anything: a client could already reconstruct this exact same information
-- from get_my_clowder_summary().
create policy "members can see their own membership rows"
  on clowder_members for select
  to authenticated
  using (user_id = auth.uid());

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
  membership_count int;
begin
  if cleaned_name is null or cleaned_name = '' then
    raise exception 'clowder name is required';
  end if;
  if char_length(cleaned_name) > 40 then
    raise exception 'clowder name is too long';
  end if;

  -- "already in a clowder" no longer applies to creation — the only limit
  -- left is the 5-clowder cap, since creating auto-joins you as a member.
  select count(*) into membership_count
  from public.clowder_members
  where user_id = auth.uid();

  if membership_count >= 5 then
    raise exception 'at the 5 clowder limit';
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
  my_membership_count int;
  normalized_code text := upper(trim(code));
begin
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

  -- "already in a clowder" -> "already in THIS clowder" — joining a
  -- second, different clowder is now the whole point.
  if exists (
    select 1 from public.clowder_members
    where clowder_id = target_id and user_id = auth.uid()
  ) then
    raise exception 'already in this clowder';
  end if;

  select count(*) into my_membership_count
  from public.clowder_members
  where user_id = auth.uid();

  if my_membership_count >= 5 then
    raise exception 'at the 5 clowder limit';
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

-- Regenerating used to resolve "my one clowder" implicitly via auth.uid()
-- alone. With multiple memberships that's ambiguous, so this now takes
-- which clowder explicitly and checks membership in THAT one — the
-- authorization check the caller must have if a clowder_id parameter is
-- ever added, same as get_my_clowder_summary below deliberately avoids by
-- staying parameterless.
drop function if exists regenerate_clowder_invite_code();

create or replace function regenerate_clowder_invite_code(target_clowder_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
  attempt int := 0;
begin
  if not exists (
    select 1 from public.clowder_members
    where clowder_id = target_clowder_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of that clowder';
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

revoke all on function regenerate_clowder_invite_code(uuid) from public, anon, authenticated;
grant execute on function regenerate_clowder_invite_code(uuid) to authenticated;

-- Now returns members across every clowder the caller belongs to, with
-- clowder_id on each row so the client groups them into sections.
-- Deliberately stays parameterless rather than taking a clowder_id — a
-- parameter would need its own "is the caller actually a member of this
-- one" check to avoid becoming a way to read an arbitrary clowder by id,
-- and the parameterless "scope to my own memberships" form doesn't need
-- one to be correct.
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
  -- cm.clowder_id, not bare clowder_id: this function's own `returns table
  -- (clowder_id uuid, ...)` declares clowder_id as an output parameter in
  -- scope for the whole function body, so an unqualified reference here is
  -- ambiguous between that and clowder_members.clowder_id — Postgres
  -- rejects it outright rather than guessing.
  where m.clowder_id in (
    select cm.clowder_id from public.clowder_members cm where cm.user_id = auth.uid()
  )
  order by c.created_at asc, m.joined_at asc;
end;
$$;

revoke all on function get_my_clowder_summary() from public, anon, authenticated;
grant execute on function get_my_clowder_summary() to authenticated;
