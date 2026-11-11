# Munchkin

A free, insight-first habit tracker for adults. Your year runs in seasons, a pixel cat reflects how consistent you've been, and an AI writes you a title for each week.

I built it because most habit trackers are either too childish or too complicated. Munchkin aims for cute but not childish, and simple enough that anyone can pick it up.

## What it does

- **Daily check-ins.** Tap a day to log a habit. Streaks and a weekly tracker update instantly.
- **A cat that reacts to you.** Your cat's mood comes from your last 7 days of completion. Pick from eight pixel-art coats.
- **Seasons, not just years.** The app's look changes with the real solstices and equinoxes. When a season ends you get a recap: check-ins, best streak, strongest weekday, completion rate.
- **Insights that unlock as you log.** Calendar heatmap, per-habit progress rings, and 7 insight cards (habit correlations, seasonal drift, momentum, recovery and more), ranked by how surprising they are compared to your own average.
- **Clowders.** Friend groups of up to 8. See each other's cats and 7-day progress rings, and nudge a friend once a day.
- **AI weekly titles.** At the end of each week, Gemini writes a short "this week you are…" title from aggregate stats only. Habit names never leave the app.
- **Installs to your phone.** Add it to your iPhone home screen and it runs like an app.

## Built with

- Next.js, React, TypeScript, Tailwind CSS
- Supabase (Postgres with row-level security on every table, auth)
- Google Gemini API, called from a server-only route
- Deployed on Vercel

I built Munchkin with Claude as my coding partner. I set the product direction, design and priorities, and tested every change. See `ROADMAP.md` for what's live and what's next.

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # add your Supabase and Gemini keys
npm run dev
```

Then open http://localhost:3000.
