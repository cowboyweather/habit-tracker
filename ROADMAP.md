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

---

## Phase 1 — Make it good enough to use daily

The goal is that you personally open it every day without effort. Nothing here is
new capability; it's removing friction.

- [ ] **Use it for a week before building more.** Not a task, a gate.
- [ ] Swipe navigation — three pages, home in the middle
- [ ] New-user grace period so the cat stays content for the first 7 days
- [ ] Empty and loading states — what the home page looks like on day zero
- [ ] Error handling when a toggle fails to save
- [ ] Password reset path (optional email captured at signup)
- [ ] Habit target types: daily vs N-times-per-week, changing streak and mood math
- [ ] Redraw the cat to match the real reference photo (tabby-and-white, white blaze, green eyes) — hire a pixel artist

---

## Phase 2 — Insights

The differentiator. Everything here is arithmetic over data already stored.

- [ ] Insights page (swipe right from home)
- [ ] Month calendar, shaded by how many habits were hit each day
- [ ] Completion by weekday
- [ ] Habit correlations — "you read on 81% of days you exercised, vs 34% when you didn't"
- [ ] Locked insights with an unlock countdown, so logging is the reward
- [ ] Season-over-season comparison once there's more than one season of data

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
- [ ] Clans: small cooperative groups, shared goal, no leaderboard
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
