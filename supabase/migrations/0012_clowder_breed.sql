-- Coat breed crosses the user boundary the same narrow, function-mediated
-- way as everything else in Clowders — a clowder-mate's own choice of
-- which sprite sheet to render with, nothing more.
--
-- Wrapped in a transaction for the same reason as 0010: the row type
-- changes (breed added), so this has to be a DROP + CREATE, not CREATE OR
-- REPLACE — Postgres rejects changing a function's OUT-parameter shape in
-- place. Dropping takes the grants with it, so they're reapplied after.
begin;

drop function get_my_clowder_summary();

create function get_my_clowder_summary()
returns table (
  clowder_id uuid,
  clowder_name text,
  invite_code text,
  user_id uuid,
  username text,
  cat_name text,
  breed text,
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
    coalesce(p.breed, 'munchkin') as breed,
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

commit;
