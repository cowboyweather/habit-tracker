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
- Clowders: create or join (invite code) a group of up to 8, member list with micro cat sprites showing name/mood/today's status/streak, one nudge per person per day with a visible "X nudged you" on Home, regenerate the invite code, leave (auto-deletes an emptied clowder)

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
| Clowder security model | `habits`/`logs`/`pets` RLS is untouched — a clowder-mate reads cross-user data only through `SECURITY DEFINER` functions that bypass RLS internally and return a narrow, pre-reduced field set (username, cat name, mood expression, logged-today, best streak). `clowders`/`clowder_members` have no direct read/write policies at all for regular users (only `clowder_members` DELETE, for leaving) — creation, joining, and reads are function-mediated so the 8-cap, one-clowder-per-user, and invite-code lookup live in one auditable place. One clowder at a time (DB-enforced via a unique constraint on `clowder_members.user_id`, not just app logic). Any member can regenerate the invite code, no owner/admin concept. Confirmed adversarially with two real accounts directly against the API, not just asserted — see commit history for the test transcript |
| Supabase default-privilege gotcha | New Postgres functions in `public` get `EXECUTE` granted to `authenticated` automatically (`alter default privileges ... grant execute on functions to authenticated`, part of Supabase's project bootstrap) — separately from whatever `PUBLIC` (the pseudo-role) has. `revoke all on function x from public` alone does **not** revoke that separate grant. Found via adversarial testing: two helper functions meant to be unreachable were directly callable by any authenticated user until the revoke explicitly named `anon, authenticated` too. Every function-level revoke in the clowders migration is written the explicit way now — worth remembering for any future `SECURITY DEFINER` function |

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

---

## Phase 5 — Social

Deliberately last. It's the only feature that requires other people's rows to be
visible, which means revisiting the security policies.

- [x] Friends: invite, accept, list — built directly as clowder membership (invite code to join, member list) rather than a separate pairwise friends layer; no standalone friend-request flow exists
- [x] Friends' cats visible, their habits private
- [x] Clowders: small cooperative groups, shared goal, no leaderboard — no "shared goal" concept built yet, just the group itself
- [x] One nudge per person per day, then the app stops you
- [ ] Hemisphere on the profile, so clan members show opposite seasons

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
