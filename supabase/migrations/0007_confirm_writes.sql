-- Companion to the app-side fix: every UPDATE/DELETE call site in the
-- client now selects back what it changed and treats zero rows as a
-- failure, even when error is null (the leave-clowder bug was exactly
-- this — RLS silently matching nothing, no error raised). This migration
-- is the one write path of that same shape living in a SECURITY DEFINER
-- function rather than client code: regenerate_clowder_invite_code's
-- UPDATE bypasses RLS (not exposed to the visibility-gap class of bug
-- specifically), but never confirmed it actually matched a row. A narrow
-- race — the clowder gets emptied and auto-deleted between the membership
-- check and the update — would have returned a fresh code that updated
-- nothing.

create or replace function regenerate_clowder_invite_code(target_clowder_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
  attempt int := 0;
  affected int;
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
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'that clowder no longer exists';
  end if;

  return new_code;
end;
$$;

revoke all on function regenerate_clowder_invite_code(uuid) from public, anon, authenticated;
grant execute on function regenerate_clowder_invite_code(uuid) to authenticated;
