# Habit Tracker — Roadmap

A free, insight-first habit tracker for adults. Seasonal rhythm, a pixel cat that
reflects consistency, and AI-written titles as the shareable artifact.

Last updated: 20 August 2026

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
- Clowders: belong to up to 5 at once (friends, family, etc.), each its own section with name/invite code/member list, up to 8 members per clowder, micro cat sprites showing name/mood/today's status/streak, one nudge per person per day (global across all shared clowders) with a visible "X nudged you" on Home, regenerate the invite code per clowder, leave one without affecting the others (auto-deletes an emptied clowder)
- Shareable clowder invite links (`/join/<code>`): native share sheet where supported, clipboard fallback otherwise. Shows the clowder's name and member count before sign-in. Survives signup + onboarding via a cookie (not sessionStorage, so it isn't lost if the link was opened in an in-app browser and reopened in the system one), redeemed right after onboarding finishes

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
| Clowder security model | `habits`/`logs`/`pets` RLS is untouched — a clowder-mate reads cross-user data only through `SECURITY DEFINER` functions that bypass RLS internally and return a narrow, pre-reduced field set (username, cat name, mood expression, logged-today, best streak). `clowders`/`clowder_members` have no direct write policies for regular users (only `clowder_members` DELETE, for leaving, and a narrow own-rows-only SELECT — see the gotcha below for why that SELECT policy exists) — creation, joining, and cross-member reads are function-mediated so the 8-members-per-clowder cap, 5-clowders-per-person cap, and invite-code lookup live in one auditable place. Any member can regenerate that clowder's invite code, no owner/admin concept. Confirmed adversarially with real accounts directly against the API at every stage, not just asserted — see commit history for the test transcripts |
| People belong to multiple clowders | Changed from one-at-a-time to up to 5 (friends, family, etc.) — `clowder_members` went from `unique(user_id)` to `unique(clowder_id, user_id)`. `get_my_clowder_summary()` stays parameterless (returns every clowder the caller belongs to, grouped client-side by `clowder_id` on each row) rather than taking a `clowder_id` argument — a parameter would need its own membership check to avoid becoming a way to read an arbitrary clowder by id, and the parameterless "just my own memberships" form doesn't need one to be correct. `regenerate_clowder_invite_code` does take a `clowder_id` now, since regenerating is clowder-specific, with exactly that membership check. Nudges stay global (one per person per day, not per clowder) |
| Supabase default-privilege gotcha | New Postgres functions in `public` get `EXECUTE` granted to `authenticated` automatically (`alter default privileges ... grant execute on functions to authenticated`, part of Supabase's project bootstrap) — separately from whatever `PUBLIC` (the pseudo-role) has. `revoke all on function x from public` alone does **not** revoke that separate grant. Found via adversarial testing: two helper functions meant to be unreachable were directly callable by any authenticated user until the revoke explicitly named `anon, authenticated` too. Every function-level revoke in the clowders migrations is written the explicit way now — worth remembering for any future `SECURITY DEFINER` function |
| PL/pgSQL `returns table(...)` column-name shadowing | A function declared `returns table (clowder_id uuid, ...)` has `clowder_id` in scope as an output parameter for its *entire* body — an unqualified `clowder_id` anywhere inside, including inside a subquery, is ambiguous against a same-named table column and Postgres rejects it outright rather than guessing. Broke `get_my_clowder_summary()` completely (every call errored) until the subquery was qualified (`cm.clowder_id`). Only bites functions whose `returns table` columns happen to share a name with a column they also query — worth double-checking whenever both coincide |
| RLS DELETE needs SELECT visibility too | A table with RLS enabled and a DELETE policy but *no* SELECT policy will silently delete nothing — Postgres needs a row to be visible via SELECT before DELETE/UPDATE can act on it, separate from whatever the DELETE policy's own `USING` clause allows. `clowder_members` had exactly this shape (deliberately no SELECT policy; reads meant to go through `get_my_clowder_summary()` only) and "leave a clowder" was a silent no-op — 200/204 success, zero rows affected, no error — since the feature was first built. Never caught because leaving was never actually tested end-to-end until the multi-clowder work forced a real adversarial pass. Fixed with a SELECT policy scoped to `user_id = auth.uid()`, which doesn't loosen anything a client couldn't already reconstruct from the summary function |
| Invite link cookie, not sessionStorage | The pending invite code is stored in an httpOnly cookie (`pending_invite_code`, 7-day expiry, set by `proxy.ts` on any `/join/<code>` visit), not sessionStorage — a link opened in an in-app browser (Instagram, etc.) and reopened in the system browser loses sessionStorage entirely, and that's a common path for a link shared in a DM. Redeemed once via a server action right after onboarding finishes (not on load, not on the join page itself for a logged-out visitor), and cleared unconditionally whether it succeeds or fails |
| `get_clowder_preview` is the first anon-callable function | Deliberately narrow (name + member count only, no ids), and returns zero rows for an invalid code rather than an error — an invalid code and a nonexistent one are indistinguishable to the caller, so it can't be used to enumerate which codes exist. No rate limiting yet; noted in Phase 5 as a future consideration if this scales past a small trusted base |

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
- [ ] Rename the Clowder page title to "clowders" (plural)
- [ ] Clowder detail page — tap a clowder to open a page listing each member's cat, cat name, and username, with a progress ring wrapped around the cat sprite itself (not sitting beside it — the pet is the indicator, no bare numbers next to each other). Same trailing-7-day figure that drives the cat's mood, reusing the ring component already built for the calendar page. Must read clearly at ~40px in a member list, with a closed ring visually distinct from 95%
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
