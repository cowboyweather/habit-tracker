-- Cat breed: which sprite sheet (public/cats/cat-<breed>.png) a pet
-- renders with. Defaults to munchkin so existing pets (and anyone who
-- skips the picker) don't need a backfill. The check constraint is the
-- source of truth for which eight names are valid — CatSprite.tsx's
-- BREEDS array must be kept in sync with it by hand, since there's no
-- way to generate one from the other across the app/DB boundary.
--
-- No policy changes needed: pets already has "users manage their own
-- pet" (for all, user_id = auth.uid()), so a plain client-side update
-- covers changing your own breed at onboarding or from settings, same as
-- the existing pet-name write path.
alter table pets
  add column breed text not null default 'munchkin';

alter table pets
  add constraint pets_breed_check check (breed in (
    'munchkin',
    'midnight',
    'marmalade',
    'tuxedo',
    'siamese',
    'russian',
    'calico',
    'snow'
  ));
