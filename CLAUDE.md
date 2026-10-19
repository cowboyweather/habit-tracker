@AGENTS.md

# Product roadmap

`ROADMAP.md` in the repo root is the source of truth for product decisions and
priorities — what's built, what's next, and decisions already made so they
don't get relitigated. Check it before proposing new features or scope.

# Supabase writes

Supabase queries only execute when awaited. Never fire-and-forget a write
with `void` — always await it and confirm the result.
