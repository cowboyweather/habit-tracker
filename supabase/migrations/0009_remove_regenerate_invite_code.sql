-- Invite codes are permanent: one code per clowder, assigned once at
-- creation (create_clowder's collision-retry loop still guarantees it's
-- unique at that moment), never changed afterward. Regeneration is gone
-- entirely, not just unreachable from the UI — the function, its grants,
-- and the app's "regenerate" button. Accepted tradeoff: if a code leaks,
-- the only fix is recreating the clowder. Fine at this scale.
drop function if exists regenerate_clowder_invite_code(uuid);
