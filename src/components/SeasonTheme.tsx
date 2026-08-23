"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startOfLocalDay, toDateKey } from "@/lib/date";
import { seasonNameFromRow, type SeasonName } from "@/lib/season-palette";
import { SeasonRecapDevPreview } from "@/components/SeasonRecapDevPreview";

const SEASONS: SeasonName[] = ["spring", "summer", "autumn", "winter"];
const isDev = process.env.NODE_ENV !== "production";

// Applies the seasonal palette by setting data-season on <html>, which
// globals.css keys off of. The real season is determined client-side (not
// server-rendered) so "today" is always the viewer's local date — a
// server-computed season could be wrong right at a boundary for a user in a
// different timezone. Trade-off: pages briefly show summer's default
// palette (the :root fallback) until this resolves on mount.
export function SeasonTheme() {
  const [fetchedSeason, setFetchedSeason] = useState<SeasonName | null>(null);
  // Dev-only preview override. Deliberately not persisted (resets on
  // reload) — persisting it via localStorage would mean reading it during
  // the initial render, which can disagree with the server's render and
  // cause a hydration mismatch.
  const [devOverride, setDevOverride] = useState<SeasonName | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  // Refetches on auth state changes, not just on mount — this component
  // lives in the root layout, which Next.js doesn't remount across
  // client-side navigations. A visitor who lands on /login unauthenticated
  // (blocked by RLS pre-migration, or just not yet signed in) and then logs
  // in within the same session needs this to run again once they're
  // actually authenticated, or the season would stay stuck at "not found"
  // for the rest of that session.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function fetchSeason() {
      const todayKey = toDateKey(startOfLocalDay(new Date()));
      const { data } = await supabase
        .from("seasons")
        .select("name")
        .lte("start_date", todayKey)
        .gte("end_date", todayKey)
        .maybeSingle();

      if (cancelled || !data) return;
      const season = seasonNameFromRow(data.name);
      if (season) setFetchedSeason(season);
    }

    fetchSeason();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchSeason();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Syncing to the DOM is the effect's job, not the click handlers' — keeps
  // state changes (event handlers) and external-system writes (this effect)
  // separate, so React never sees a DOM mutation happen mid-render.
  useEffect(() => {
    const active = devOverride ?? fetchedSeason;
    if (active) {
      document.documentElement.dataset.season = active;
    }
  }, [devOverride, fetchedSeason]);

  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1">
      {devOpen && (
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-card p-2 shadow-lg">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDevOverride(s)}
              className={`rounded px-3 py-1 text-left text-xs capitalize transition hover:bg-line/60 ${
                devOverride === s ? "font-semibold text-accent" : "text-ink"
              }`}
            >
              {s}
            </button>
          ))}
          {devOverride && (
            <button
              type="button"
              onClick={() => setDevOverride(null)}
              className="rounded px-3 py-1 text-left text-xs text-muted transition hover:bg-line/60"
            >
              Clear override
            </button>
          )}
          <div className="my-1 border-t border-line" />
          <SeasonRecapDevPreview />
        </div>
      )}
      <button
        type="button"
        onClick={() => setDevOpen((o) => !o)}
        className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-lg transition active:scale-95"
      >
        Season: {devOverride ?? "auto"}
      </button>
    </div>
  );
}
