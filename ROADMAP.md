# Habit Tracker — Roadmap

A free, insight-first habit tracker for adults. Seasonal rhythm, a pixel cat that
reflects consistency, and AI-written titles as the shareable artifact.

Last updated: 24 August 2026

---

## Where things stand

**Live and working**

- Next.js + TypeScript + Tailwind, deployed on Vercel, auto-deploys on push to `main`
- Supabase Postgres with row-level security on every table
- Eight tables: `seasons` (seeded through 2027), `habits`, `logs`, `pets`, `titles`, `clowders`, `clowder_members`, `clowder_nudges`
- Username + password auth, signup, login, sign-out
- Onboarding: name the cat, add first habits
- Home page: date and season line, greeting, title card, cat panel, weekly tracker
- Tappable day circles with optimistic updates and streak counts
- Cat mood computed live from trailing 7-day completion
- Habit management: add, rename, recolor, reorder, archive
- Installs to an iPhone home screen with a custom icon
- Swipe navigation: Clowder, Home, Calendar, Insights
- Calendar: month view shaded by completion, per-habit progress rings, today button, unlimited retroactive editing via the tap-to-expand day detail
- Insights: completion by weekday, habit correlations and season-over-season drift once there's enough data
- Season recap: full-bleed screen shown once after a season ends, in the outgoing season's palette — check-ins, best streak, strongest weekday, completion rate, a fixed title placeholder, warmer copy for a thin season. Dev-only preview for any past season via the season-theme widget
- Clowders: belong to up to 5 at once (friends, family, etc.), restructured into two real pages. `/clowders` is a light list — each clowder as a tappable house icon (one shared placeholder for now) and name, "+" to create or join another, up to 8 members per clowder. `/clowders/[id]` is the detail page: clowder name as the title, invite code shown small and unobtrusive, members in a responsive grid (2 up to 4 per row) each showing their cat with a trailing-7-day progress ring wrapped around it (closed rings get a checkmark badge, not just a full arc, so they read at a glance), cat name, and username. The leader — whoever created the clowder, or the longest-standing remaining member if they've left — is the only one who sees the settings icon button (rename, for now; enforced server-side, not just hidden). No visible marker on the leader's card for now — the crown was tried and pulled (see roadmap). Leaving asks for confirmation and auto-deletes an emptied clowder. Each clowder's invite code is permanent, assigned once at creation, no regenerate. Zero-clowder state is still just two buttons, create or join, one form open at a time
- Nudging a clowder-mate: tap their cat in the member grid to open a small sheet (ring, cat name, username, and a nudge button that disables once used today) rather than a button sitting in the grid itself

**Not built yet:** everything below.

---

## Decisions already made

Recorded so they don't get relitigated in future sessions.

| Decision | Detail |
| --- | --- |
| Mood source | Trailing 7-day completion rate, not streak. 80%+ thriving, 50–79% content, 25–49% restless, under 25% scruffy |
| The cat never dies | Scruffy is the floor. No punishment loop, always recoverable |
| Seasons | Northern hemisphere only for now. Boundaries on actual solstice and equinox dates |
| Streak convention | Counts from yesterday if today isn't logged yet, so it doesn't visibly die every morning |
| Analytics are free | Paywalling insight is the category norm and the thing this exists to undercut |
| Archive, never delete | Habits archive so their history still counts in stats |
| Titles | Gently funny, never cruel. Self-roast is fine; being roasted by software is not |
| Art | Pixel, micro dialect, seven expressions, palette swaps for alternate coats |
| Retroactive editing | Unlimited — no bound on how far back a day can be edited. Denominator (habits trackable that day) still bounded by created_at/archived_at; a day that ends up over 100% from backfilled logs shades as fully complete rather than being capped or hidden |
| Season recap "seen" tracking | Reuses the existing `titles` table (period_type='season') rather than a new one — a row is both the seen-record and the stored title/stats snapshot, which is also what Phase 3's "reopenable cards" needs. Written on dismiss, not on load, so closing the tab before dismissing doesn't burn the one-time recap — seeing it twice is an accepted failure mode |
| Season recap eligibility | Only the most-recently-ended season ever triggers, no backlog for a longer absence. Requires ≥1 real log dated in that season (backfilled logs count — if they logged it, it's theirs). A season counts as "thin" if completion rate is under 25% (mirrors the cat's scruffy floor) OR total check-ins are under 15 — the count check exists because completion rate alone reads as artificially high when a habit is backfilled into a season it didn't exist during (zero trackable days that season, so the ratio defaults to 100%) |
| Clowder security model | `habits`/`logs`/`pets` RLS is untouched — a clowder-mate reads cross-user data only through `SECURITY DEFINER` functions that bypass RLS internally and return a narrow, pre-reduced field set (username, cat name, mood expression, logged-today, best streak). `clowders`/`clowder_members` have no direct write policies for regular users (only `clowder_members` DELETE, for leaving, and a narrow own-rows-only SELECT — see the gotcha below for why that SELECT policy exists) — creation, joining, and cross-member reads are function-mediated so the 8-members-per-clowder cap, 5-clowders-per-person cap, and invite-code lookup live in one auditable place. No owner/admin concept. Confirmed adversarially with real accounts directly against the API at every stage, not just asserted — see commit history for the test transcripts |
| People belong to multiple clowders | Changed from one-at-a-time to up to 5 (friends, family, etc.) — `clowder_members` went from `unique(user_id)` to `unique(clowder_id, user_id)`. `get_my_clowder_summary()` stays parameterless (returns every clowder the caller belongs to, grouped client-side by `clowder_id` on each row) rather than taking a `clowder_id` argument — a parameter would need its own membership check to avoid becoming a way to read an arbitrary clowder by id, and the parameterless "just my own memberships" form doesn't need one to be correct. Nudges stay global (one per person per day, not per clowder) |
| Invite codes are permanent, no regenerate | Each clowder gets one code at creation (`create_clowder`'s collision-retry loop guarantees it's unique against every other clowder at that moment) and it never changes after that — `regenerate_clowder_invite_code` was built, then removed entirely (function, grants, and the UI button) rather than left dormant. Accepted tradeoff: a leaked code has no revocation path short of recreating the clowder. Fine at this scale; revisit if it ever isn't |
| Supabase default-privilege gotcha | New Postgres functions in `public` get `EXECUTE` granted to `authenticated` automatically (`alter default privileges ... grant execute on functions to authenticated`, part of Supabase's project bootstrap) — separately from whatever `PUBLIC` (the pseudo-role) has. `revoke all on function x from public` alone does **not** revoke that separate grant. Found via adversarial testing: two helper functions meant to be unreachable were directly callable by any authenticated user until the revoke explicitly named `anon, authenticated` too. Every function-level revoke in the clowders migrations is written the explicit way now — worth remembering for any future `SECURITY DEFINER` function |
| PL/pgSQL `returns table(...)` column-name shadowing | A function declared `returns table (clowder_id uuid, ...)` has `clowder_id` in scope as an output parameter for its *entire* body — an unqualified `clowder_id` anywhere inside, including inside a subquery, is ambiguous against a same-named table column and Postgres rejects it outright rather than guessing. Broke `get_my_clowder_summary()` completely (every call errored) until the subquery was qualified (`cm.clowder_id`). Only bites functions whose `returns table` columns happen to share a name with a column they also query — worth double-checking whenever both coincide |
| RLS DELETE needs SELECT visibility too | A table with RLS enabled and a DELETE policy but *no* SELECT policy will silently delete nothing — Postgres needs a row to be visible via SELECT before DELETE/UPDATE can act on it, separate from whatever the DELETE policy's own `USING` clause allows. `clowder_members` had exactly this shape (deliberately no SELECT policy; reads meant to go through `get_my_clowder_summary()` only) and "leave a clowder" was a silent no-op — 200/204 success, zero rows affected, no error — since the feature was first built. Never caught because leaving was never actually tested end-to-end until the multi-clowder work forced a real adversarial pass. Fixed with a SELECT policy scoped to `user_id = auth.uid()`, which doesn't loosen anything a client couldn't already reconstruct from the summary function |
| Shareable `/join/<code>` links: built, then dropped | Built with a full signup/onboarding-surviving redemption flow, then removed — this is a home-screen PWA, and iOS opens links in Safari rather than the installed app, so a shared link produced a second, logged-out copy of the app instead of anything useful. Worse than just sending the code. The `/join` page, its cookie-based redemption flow, and the share/copy-link button are all gone; `get_clowder_preview` (see below) is kept since it's harmless and immediately useful again if links return — e.g. shipping natively, where this problem doesn't exist |
| `get_clowder_preview` is the first anon-callable function | Deliberately narrow (name + member count only, no ids), and returns zero rows for an invalid code rather than an error — an invalid code and a nonexistent one are indistinguishable to the caller, so it can't be used to enumerate which codes exist. No rate limiting yet; noted in Phase 5 as a future consideration if this scales past a small trusted base. Currently unused by any UI — kept in reserve, see above |
| Clowder leader is derived, not stored | No `leader_id` column — `_clowder_leader()` computes it live as `clowders.created_by`, unless that person has left the clowder, in which case it falls back to whoever in `clowder_members` has the earliest `joined_at`. Nothing to keep in sync when someone leaves, at the cost of a small per-lookup computation (fine at 8 members max). Every leader-only action (currently just `rename_clowder`) checks this function itself rather than trusting the client — a direct RPC call from a non-leader is rejected the same way the UI already prevents, not just hidden from it |

---

## Phase 1 — Make it good enough to use daily

The goal is that you personally open it every day without effort. Nothing here is
new capability; it's removing friction.

- [ ] **Use it for a week before building more.** Not a task, a gate.
- [x] Swipe navigation — four pages (Clowder, Home, Calendar, Insights), home in the middle
- [x] New-user grace period so the cat stays content for the first 7 days
- [x] Empty and loading states — what the home page looks like on day zero
- [x] Error handling when a toggle fails to save
- [ ] Password reset path (optional email captured at signup)
- [x] Habit target types: daily vs N-times-per-week, changing streak and mood math
- [ ] Redraw the cat to match the real reference photo (tabby-and-white, white blaze, green eyes) — hire a pixel artist

---

## Phase 2 — Insights

The differentiator. Everything here is arithmetic over data already stored.

- [x] Insights page (swipe right from home) — built as two pages, Calendar then Insights, since one page got crowded once rings and correlations were added
- [x] Month calendar, shaded by how many habits were hit each day
- [x] Completion by weekday
- [x] Habit correlations — "you read on 81% of days you exercised, vs 34% when you didn't"
- [x] Locked insights, gated by days-of-logging / seasons-of-data thresholds rather than a fixed unlock date, so logging is still the reward
- [x] Season-over-season comparison once there's more than one season of data
- [x] "Today" button on the calendar, to jump back to the current month once there's more than a couple of months of history
- [x] Retroactive editing of past days. Built as planned: the tap-to-expand day detail on the calendar is editable, habits toggle directly from there, same optimistic-update/upsert path as Home's circles

---

## Phase 3 — Titles and the season recap

The viral surface. Not worth building until there's real data to describe.

- [ ] Weekly title generated Sunday night from that week's numbers
- [ ] Prompt with 8–10 hand-written examples setting the voice
- [ ] Explicit rule for what a bad week sounds like
- [x] Season recap screen shown once on first open after a solstice — title is a fixed placeholder for now, not yet AI-generated
- [ ] Shareable card image — the thing people actually post
- [x] Store generated titles with the stats they came from, so cards can be reopened — built early, as part of the season recap's `titles` row; weekly titles will use the same mechanism

---

## Phase 4 — Polish

- [ ] Seasonal UI theming — palette and panel art change at each solstice
- [ ] Seasonal scene art behind the cat (blossoms, shore, leaves, snow)
- [ ] Momentary expressions: blep at random, excited on a full day, sleepy after 11pm
- [ ] Notes on a session (parked in the original spec, still wanted)
- [ ] Reminders — needs real thought, web push on iOS is fiddly
- [ ] Time zone handling for travel
- [ ] Cat colorways — eight presets, chosen during onboarding and changeable any time from settings. Palette swap on the existing sprite, no new sprite work (coat color is already just a palette lookup in `CatSprite.tsx`). One preset must match the real reference cat: brown/grey tabby, white blaze up the face, white bib and paws, green eyes. Placeholder art for all eight until the pixel artist redraws them. Stored on `pets`. Visible to clowder members — that's the point of customizing it — so this is another field crossing the user boundary in the same narrow, function-mediated way as the rest of Clowders, not a new access pattern

---

## Phase 5 — Social

Deliberately last. It's the only feature that requires other people's rows to be
visible, which means revisiting the security policies.

- [x] Friends: invite, accept, list — built directly as clowder membership (invite code to join, member list) rather than a separate pairwise friends layer; no standalone friend-request flow exists
- [x] Friends' cats visible, their habits private
- [x] Clowders: small cooperative groups, shared goal, no leaderboard — no "shared goal" concept built yet, just the group itself
- [x] One nudge per person per day, then the app stops you
- [ ] Hemisphere on the profile, so clan members show opposite seasons
- [ ] Clowder icons — a small image or emblem per clowder
- [ ] Shared clowder goals — a collective target the group works toward together
- [ ] Per-clowder habit visibility setting, default off. Opt in to show your habit names to a specific clowder. Expands what crosses the user boundary beyond the current name/mood/streak/today-status set, so it needs its own adversarial testing pass when built, same rigor as the rest of Clowders
- [x] Rename the Clowder page title to "clowders" (plural)
- [x] Clowder detail page — a separate `/clowders/[id]` route listing each member's cat, cat name, and username, with a progress ring wrapped around the cat sprite itself. Same trailing-7-day figure that drives the cat's mood. Reads clearly at ~44px in a responsive grid, with a closed ring getting a checkmark badge rather than relying on the arc alone to read as "done" vs. 95%
- [x] Clowder leader — derived from `created_by`, settings (rename) visible and enforced leader-only
- [ ] Bring back a leader marker on the member card — the crown was removed in the sizing pass (cluttered the card at the larger ring size); worth a lighter-weight version once there's room
- [x] Give nudging a new home in the redesigned member card — tapping a member's cat opens a small sheet (ring, cat name, username, and a nudge button that disables once used today) rather than putting a button back in the grid itself
- [ ] Different house icon per clowder — every clowder currently shares one placeholder icon on the `/clowders` list
- [ ] Rate-limiting on `get_clowder_preview` — not needed at current scale, but it's the one unauthenticated surface in the app and the obvious target for a brute-force scan of the invite code space if usage grows

---

## Parked

Wanted, not scheduled.

- Pet cosmetics: hats, scarves, seasonal items
- Alternate coats as unlockables
- Pet battles or abilities — unresolved whether this fits the tone
- App store distribution, which would unlock real push notifications
- Southern hemisphere seasons

---

## Open questions

- Does the cat need a reason to be opened on a day with nothing to log?
- What happens to a season's habits at rollover — carry over silently, or a review moment?
- Is a 7-day mood window right, or does it move too fast?
- At what point does a bad week's title stop being funny?
