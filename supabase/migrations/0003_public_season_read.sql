-- Seasonal theming needs to apply on login/signup too, which happen before
-- the visitor is authenticated. Season boundaries have no per-user or
-- sensitive content, so widen the read policy from "any logged-in user" to
-- anyone, including logged-out visitors.

drop policy "seasons are readable by any logged-in user" on seasons;

create policy "seasons are publicly readable"
  on seasons for select
  to anon, authenticated
  using (true);
