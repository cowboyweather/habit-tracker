-- First function callable by anon — the /join/<code> page needs to show a
-- clowder's name and member count before the visitor has signed in at all.
-- Deliberately narrow: two fields, no ids, no member details. Returns zero
-- rows for an invalid code rather than raising an error, so it can't be
-- used to distinguish "wrong code" from "server problem" — both look
-- identical to the caller — and can't be used to enumerate which codes
-- exist by probing for a different response shape.
--
-- SECURITY DEFINER because clowders has no SELECT policy for anyone at
-- all, not even the owning user — same reasoning as everything else in
-- this feature, just now reachable by an unauthenticated caller too.
--
-- Rate-limiting isn't implemented — noted as a future consideration if
-- this scales past a small, trusted user base. This is the only
-- unauthenticated surface in the app, so it's the obvious target for a
-- brute-force scan of the invite code space if that ever matters.
create or replace function get_clowder_preview(code text)
returns table (name text, member_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(code));
begin
  return query
  select
    c.name,
    (
      select count(*)::int
      from public.clowder_members cm
      where cm.clowder_id = c.id
    ) as member_count
  from public.clowders c
  where c.invite_code = normalized_code;
end;
$$;

revoke all on function get_clowder_preview(text) from public, anon, authenticated;
grant execute on function get_clowder_preview(text) to anon, authenticated;
