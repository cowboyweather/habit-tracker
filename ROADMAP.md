# Habit Tracker — Roadmap

A free, insight-first habit tracker for adults. Seasonal rhythm, a pixel cat that
reflects consistency, and AI-written titles as the shareable artifact.

Last updated: 20 August 2026

---

## Where things stand

**Live and working**

- Next.js + TypeScript + Tailwind, deployed on Vercel, auto-deploys on push to `main`
- Supabase Postgres with row-level security on every table
- Five tables: `seasons` (seeded through 2027), `habits`, `logs`, `pets`, `titles`
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
- [ ] Season recap screen shown once on first open after a solstice
- [ ] Shareable card image — the thing people actually post
- [ ] Store generated titles with the stats they came from, so cards can be reopened

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

- [ ] Friends: invite, accept, list
- [ ] Friends' cats visible, their habits private
- [ ] Clowders: small cooperative groups, shared goal, no leaderboard
- [ ] One nudge per person per day, then the app stops you
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
