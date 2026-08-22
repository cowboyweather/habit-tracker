"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, daysBetween, parseDateKey, startOfLocalDay, toDateKey } from "@/lib/date";
import {
  computeDayStat,
  isActiveOn,
  WEEKDAY_LETTERS,
  type HabitRecord,
  type LogRow,
  type DayStat,
} from "@/lib/habit-stats";

type SeasonRow = { name: string; start_date: string; end_date: string };

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const CORRELATION_DAYS_NEEDED = 21;
const CORRELATION_MIN_SAMPLE = 3;

function seasonForDate(
  seasons: SeasonRow[],
  dateKey: string,
): SeasonRow | null {
  return (
    seasons.find((s) => dateKey >= s.start_date && dateKey <= s.end_date) ??
    null
  );
}

export function InsightsPanel({
  userId,
  createdAt,
  isActive,
}: {
  userId: string;
  createdAt: string;
  isActive: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [habits, setHabits] = useState<HabitRecord[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const accountCreated = useMemo(
    () => startOfLocalDay(new Date(createdAt)),
    [createdAt],
  );

  // Refetches every time this panel actually becomes visible, not just on
  // mount — SwipeShell mounts all panels simultaneously, so a fetch on mount
  // alone would go stale the moment you mark something on Home and then
  // swipe over here. Deliberately doesn't reset loading/loadError first: a
  // background refresh silently swaps in new data once it resolves, rather
  // than flashing the skeleton on every revisit.
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    async function load() {
      try {
        const [habitsRes, logsRes, seasonsRes] = await Promise.all([
          supabase
            .from("habits")
            .select(
              "id, name, color, position, target_type, target_count, created_at, archived, archived_at",
            )
            .eq("user_id", userId)
            .abortSignal(controller.signal),
          supabase
            .from("logs")
            .select("habit_id, log_date, done")
            .eq("user_id", userId)
            .abortSignal(controller.signal),
          supabase
            .from("seasons")
            .select("name, start_date, end_date")
            .abortSignal(controller.signal),
        ]);

        clearTimeout(timeoutId);
        if (cancelled) return;

        if (habitsRes.error || logsRes.error || seasonsRes.error) {
          setLoadError("couldn't load your data.");
          setLoading(false);
          return;
        }

        setHabits((habitsRes.data as HabitRecord[]) ?? []);
        setLogs((logsRes.data as LogRow[]) ?? []);
        setSeasons((seasonsRes.data as SeasonRow[]) ?? []);
        setLoading(false);
      } catch {
        clearTimeout(timeoutId);
        if (cancelled) return;
        setLoadError("couldn't load your data.");
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, retryToken, isActive]);

  function retry() {
    setLoading(true);
    setLoadError(null);
    setRetryToken((t) => t + 1);
  }

  const logsByDate = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const log of logs) {
      const arr = map.get(log.log_date) ?? [];
      arr.push(log);
      map.set(log.log_date, arr);
    }
    return map;
  }, [logs]);

  // Every day from account creation to today, computed once and reused for
  // the weekday bars, correlations, and seasonal drift below.
  const dailyStats = useMemo(() => {
    const map = new Map<string, DayStat>();
    const totalDays = daysBetween(accountCreated, today);
    for (let i = 0; i <= totalDays; i++) {
      const key = toDateKey(addDays(accountCreated, i));
      map.set(key, computeDayStat(habits, logsByDate, key));
    }
    return map;
  }, [habits, logsByDate, accountCreated, today]);

  const loggedDayCount = useMemo(
    () => new Set(logs.map((l) => l.log_date)).size,
    [logs],
  );

  const weekdayStats = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => ({
      active: 0,
      completed: 0,
      trackableDays: 0,
    }));
    for (const [key, stat] of dailyStats) {
      if (stat.active === 0) continue;
      const weekday = parseDateKey(key).getDay();
      buckets[weekday].active += stat.active;
      buckets[weekday].completed += stat.completed;
      buckets[weekday].trackableDays += 1;
    }
    return buckets.map((b) => ({
      ...b,
      rate: b.active > 0 ? b.completed / b.active : 0,
    }));
  }, [dailyStats]);

  const weekdaySummary = useMemo(() => {
    const withData = weekdayStats
      .map((b, i) => ({ ...b, index: i }))
      .filter((b) => b.trackableDays > 0);
    if (withData.length < 2) return "not enough data yet.";
    const strongest = withData.reduce((a, b) => (b.rate > a.rate ? b : a));
    const weakest = withData.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (strongest.index === weakest.index) {
      return "completion looks steady across the week so far.";
    }
    return `strongest on ${WEEKDAY_NAMES[strongest.index]}s, weakest on ${WEEKDAY_NAMES[weakest.index]}s.`;
  }, [weekdayStats]);

  const correlation = useMemo(() => {
    if (loggedDayCount < CORRELATION_DAYS_NEEDED || habits.length < 2) {
      return null;
    }
    let best: {
      a: HabitRecord;
      b: HabitRecord;
      withRate: number;
      withoutRate: number;
      diff: number;
    } | null = null;

    for (const a of habits) {
      for (const b of habits) {
        if (a.id === b.id) continue;
        let withA = 0;
        let withADone = 0;
        let withoutA = 0;
        let withoutADone = 0;
        for (const key of dailyStats.keys()) {
          if (!isActiveOn(a, key) || !isActiveOn(b, key)) continue;
          const aDone =
            logsByDate.get(key)?.find((l) => l.habit_id === a.id)?.done ??
            false;
          const bDone =
            logsByDate.get(key)?.find((l) => l.habit_id === b.id)?.done ??
            false;
          if (aDone) {
            withA++;
            if (bDone) withADone++;
          } else {
            withoutA++;
            if (bDone) withoutADone++;
          }
        }
        if (
          withA < CORRELATION_MIN_SAMPLE ||
          withoutA < CORRELATION_MIN_SAMPLE
        ) {
          continue;
        }
        const withRate = withADone / withA;
        const withoutRate = withoutADone / withoutA;
        const diff = Math.abs(withRate - withoutRate);
        if (!best || diff > best.diff) {
          best = { a, b, withRate, withoutRate, diff };
        }
      }
    }
    return best;
  }, [habits, dailyStats, logsByDate, loggedDayCount]);

  const seasonalDrift = useMemo(() => {
    const bySeasonName = new Map<
      string,
      { season: SeasonRow; active: number; completed: number }
    >();
    for (const [key, stat] of dailyStats) {
      if (stat.active === 0) continue;
      const season = seasonForDate(seasons, key);
      if (!season) continue;
      const entry = bySeasonName.get(season.name) ?? {
        season,
        active: 0,
        completed: 0,
      };
      entry.active += stat.active;
      entry.completed += stat.completed;
      bySeasonName.set(season.name, entry);
    }
    const entries = Array.from(bySeasonName.values()).sort((a, b) =>
      a.season.start_date.localeCompare(b.season.start_date),
    );
    if (entries.length < 2) return null;
    const prev = entries[entries.length - 2];
    const curr = entries[entries.length - 1];
    const deltaPct = Math.round(
      (curr.completed / curr.active - prev.completed / prev.active) * 100,
    );
    return {
      prevName: prev.season.name.split(" ")[0].toLowerCase(),
      currName: curr.season.name.split(" ")[0].toLowerCase(),
      deltaPct,
    };
  }, [dailyStats, seasons]);

  const nextSeasonCountdown = useMemo(() => {
    const upcoming = seasons
      .filter((s) => s.start_date > todayKey)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (upcoming.length === 0) return null;
    const next = upcoming[0];
    return {
      name: next.name.split(" ")[0].toLowerCase(),
      days: daysBetween(today, parseDateKey(next.start_date)),
    };
  }, [seasons, todayKey, today]);

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <div className="h-8 w-28 animate-pulse rounded bg-line" />

        <div className="flex flex-col gap-3">
          <div className="h-3 w-40 animate-pulse rounded bg-line" />
          <div className="flex h-20 items-end justify-between gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="w-full animate-pulse rounded bg-line"
                style={{ height: `${30 + (i % 3) * 15}%` }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="h-3 w-20 animate-pulse rounded bg-line" />
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-line" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted">{loadError}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
        >
          try again
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8"
      style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
        insights
      </h1>

      {loggedDayCount === 0 && (
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
          this fills in as you log habits — nothing to show yet.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Completion by weekday
        </p>
        <div className="flex h-20 items-end justify-between gap-2">
          {weekdayStats.map((b, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${Math.max(4, b.rate * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {WEEKDAY_LETTERS.map((l, i) => (
            <span
              key={i}
              className="flex-1 text-center font-mono text-[9px] uppercase text-muted"
            >
              {l}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted">{weekdaySummary}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Insights
        </p>

        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="font-medium text-ink">habit correlations</p>
          {habits.length < 2 ? (
            <p className="mt-1 text-sm text-muted">
              add a second habit to compare.
            </p>
          ) : loggedDayCount < CORRELATION_DAYS_NEEDED ? (
            <p className="mt-1 text-sm text-muted">
              {CORRELATION_DAYS_NEEDED - loggedDayCount} more days of logging
            </p>
          ) : correlation ? (
            <p className="mt-1 text-sm text-ink">
              on days you did {correlation.a.name}, you also did{" "}
              {correlation.b.name} {Math.round(correlation.withRate * 100)}% of
              the time — vs {Math.round(correlation.withoutRate * 100)}%
              otherwise.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              still gathering enough overlap between habits.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="font-medium text-ink">seasonal drift</p>
          {seasonalDrift ? (
            <p className="mt-1 text-sm text-ink">
              {seasonalDrift.deltaPct >= 0 ? "up" : "down"}{" "}
              {Math.abs(seasonalDrift.deltaPct)}% from {seasonalDrift.prevName}.
            </p>
          ) : nextSeasonCountdown ? (
            <p className="mt-1 text-sm text-muted">
              {nextSeasonCountdown.days} days until {nextSeasonCountdown.name}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              needs data from a second season.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
