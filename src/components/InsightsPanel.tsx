"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, daysBetween, parseDateKey, startOfLocalDay, toDateKey } from "@/lib/date";
import {
  computeDayStat,
  computeBestStreak,
  computePerfectDays,
  computeRecoveryGap,
  computeWeekdayGap,
  dailyStatsRangeStart,
  isActiveOn,
  windowAverageRate,
  WEEKDAY_LETTERS,
  WEEKDAY_NAMES,
  type HabitRecord,
  type LogRow,
  type DayStat,
} from "@/lib/habit-stats";

type SeasonRow = { name: string; start_date: string; end_date: string };

// Every threshold below is a starting guess (per-insight, not one global
// gate) — easy to retune once these have run against real data instead of
// being calibrated in the abstract.
const STRONGEST_DAY_MIN_DAYS = 4;
const BEST_STREAK_MIN_DAYS = 4;
const PERFECT_DAYS_MIN_DAYS = 4;
const MOMENTUM_VISIBLE_DAYS = 10;
// A fair trailing-7-vs-previous-7 comparison needs 14 days of real
// history, not 10 — at day 10-13 the "previous week" window is only
// partially real. The card still appears at 10 (matching the spec), it
// just stays in its "gathering" message until day 14 rather than
// comparing against mostly-empty days.
const MOMENTUM_READY_DAYS = 14;
const MOMENTUM_STEADY_THRESHOLD_PCT = 10;
const RECOVERY_MIN_DAYS = 10;
const CORRELATION_MIN_DAYS = 14;
const CORRELATION_MIN_SAMPLE = 3;
const CORRELATION_MIN_OVERLAP_DAYS = 10;

const MAX_FEATURED = 5;

type InsightState =
  | { status: "locked"; message: string }
  | { status: "ready"; headline: string; surprise: number };

type Insight = {
  id: string;
  title: string;
  state: InsightState;
};

function daysRemainingMessage(loggedDayCount: number, threshold: number): string {
  const remaining = threshold - loggedDayCount;
  return `${remaining} more day${remaining === 1 ? "" : "s"} of logging`;
}

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

  // Normally accountCreated, but a retroactive log (Home's current-week
  // strip allows toggling any day in the calendar week, including ones
  // before the account existed) can push this earlier — see CalendarPanel's
  // matching comment.
  const historyStart = useMemo(
    () => dailyStatsRangeStart(accountCreated, logsByDate),
    [accountCreated, logsByDate],
  );

  // Every day from historyStart to today, computed once and reused for the
  // weekday bars, correlations, and seasonal drift below.
  const dailyStats = useMemo(() => {
    const map = new Map<string, DayStat>();
    const totalDays = daysBetween(historyStart, today);
    for (let i = 0; i <= totalDays; i++) {
      const key = toDateKey(addDays(historyStart, i));
      map.set(key, computeDayStat(habits, logsByDate, key));
    }
    return map;
  }, [habits, logsByDate, historyStart, today]);

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
      if (stat.active === 0 && stat.completed === 0) continue;
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

  const currentSeason = useMemo(
    () => seasonForDate(seasons, todayKey),
    [seasons, todayKey],
  );

  // ---------------------------------------------------------------------
  // Insight calculations. Each produces either null/insufficient (still
  // locked, with a specific reason) or a real result (ready, with a
  // surprise score used to rank it against the others).
  // ---------------------------------------------------------------------

  const weekdayGap = useMemo(() => computeWeekdayGap(weekdayStats), [weekdayStats]);

  const bestStreak = useMemo(
    () => computeBestStreak(habits, logsByDate, historyStart, today),
    [habits, logsByDate, historyStart, today],
  );

  const perfectDaysCount = useMemo(() => {
    const rangeStart =
      currentSeason && currentSeason.start_date > toDateKey(historyStart)
        ? parseDateKey(currentSeason.start_date)
        : historyStart;
    return computePerfectDays(habits, logsByDate, rangeStart, today);
  }, [habits, logsByDate, historyStart, today, currentSeason]);

  const hasDailyHabit = useMemo(
    () => habits.some((h) => h.target_type === "daily"),
    [habits],
  );

  const momentumDelta = useMemo(() => {
    const trailingWindow = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
    const previousWindow = Array.from({ length: 7 }, (_, i) => addDays(today, -7 - i));
    const trailingRate = windowAverageRate(habits, logsByDate, trailingWindow);
    const previousRate = windowAverageRate(habits, logsByDate, previousWindow);
    if (trailingRate === null || previousRate === null) return null;
    return Math.round((trailingRate - previousRate) * 100);
  }, [habits, logsByDate, today]);

  const recovery = useMemo(
    () => computeRecoveryGap(habits, logsByDate, historyStart, today),
    [habits, logsByDate, historyStart, today],
  );

  const correlation = useMemo(() => {
    if (loggedDayCount < CORRELATION_MIN_DAYS || habits.length < 2) {
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
        let bothTrackable = 0;
        for (const key of dailyStats.keys()) {
          if (!isActiveOn(a, key) || !isActiveOn(b, key)) continue;
          bothTrackable++;
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
          bothTrackable < CORRELATION_MIN_OVERLAP_DAYS ||
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

  // ---------------------------------------------------------------------
  // Assemble every insight into one shape, then pick which 3-5 get
  // featured. Habit correlation is always featured once unlocked (the
  // headline insight, doesn't compete in the ranking); everything else
  // fills the remaining slots by surprise score — distance from what's
  // otherwise typical, not a fixed display order.
  // ---------------------------------------------------------------------

  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];

    // Strongest day
    if (loggedDayCount < STRONGEST_DAY_MIN_DAYS) {
      list.push({
        id: "strongestDay",
        title: "strongest day",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, STRONGEST_DAY_MIN_DAYS) },
      });
    } else if (!weekdayGap) {
      list.push({
        id: "strongestDay",
        title: "strongest day",
        state: { status: "locked", message: "needs a couple more of each weekday to compare." },
      });
    } else {
      const gapPoints = Math.abs(weekdayGap.dayRatePct - weekdayGap.restRatePct);
      const dayName = `${WEEKDAY_NAMES[weekdayGap.weekdayIndex]}s`;
      const label = weekdayGap.direction === "weak" ? "your weak spot" : "your best day";
      list.push({
        id: "strongestDay",
        title: "strongest day",
        state: {
          status: "ready",
          headline: `${dayName} are ${label}: ${weekdayGap.dayRatePct}% vs ${weekdayGap.restRatePct}% the rest of the week.`,
          surprise: Math.min(1, gapPoints / 40),
        },
      });
    }

    // Best streak
    if (loggedDayCount < BEST_STREAK_MIN_DAYS) {
      list.push({
        id: "bestStreak",
        title: "best streak",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, BEST_STREAK_MIN_DAYS) },
      });
    } else if (!bestStreak) {
      list.push({
        id: "bestStreak",
        title: "best streak",
        state: { status: "locked", message: "still building your first real streak." },
      });
    } else {
      const cap = bestStreak.unit === "days" ? 14 : 8;
      list.push({
        id: "bestStreak",
        title: "best streak",
        state: {
          status: "ready",
          headline: `your longest run is ${bestStreak.length} ${bestStreak.unit}, on ${bestStreak.habit.name}.`,
          surprise: Math.min(1, bestStreak.length / cap),
        },
      });
    }

    // Perfect days
    if (loggedDayCount < PERFECT_DAYS_MIN_DAYS) {
      list.push({
        id: "perfectDays",
        title: "perfect days",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, PERFECT_DAYS_MIN_DAYS) },
      });
    } else if (!hasDailyHabit) {
      list.push({
        id: "perfectDays",
        title: "perfect days",
        state: { status: "locked", message: "add a daily habit to track this." },
      });
    } else {
      list.push({
        id: "perfectDays",
        title: "perfect days",
        state: {
          status: "ready",
          headline: `you've hit everything on ${perfectDaysCount} day${perfectDaysCount === 1 ? "" : "s"} this season.`,
          surprise: Math.min(1, perfectDaysCount / 10),
        },
      });
    }

    // Momentum
    if (loggedDayCount < MOMENTUM_VISIBLE_DAYS) {
      list.push({
        id: "momentum",
        title: "momentum",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, MOMENTUM_VISIBLE_DAYS) },
      });
    } else if (loggedDayCount < MOMENTUM_READY_DAYS || momentumDelta === null) {
      list.push({
        id: "momentum",
        title: "momentum",
        state: { status: "locked", message: "needs a few more days for a full two-week comparison." },
      });
    } else {
      const headline =
        Math.abs(momentumDelta) < MOMENTUM_STEADY_THRESHOLD_PCT
          ? "you're holding steady."
          : `you're ${momentumDelta > 0 ? "up" : "down"} ${Math.abs(momentumDelta)}% from last week.`;
      list.push({
        id: "momentum",
        title: "momentum",
        state: {
          status: "ready",
          headline,
          surprise: Math.min(1, Math.abs(momentumDelta) / 30),
        },
      });
    }

    // Recovery
    if (loggedDayCount < RECOVERY_MIN_DAYS) {
      list.push({
        id: "recovery",
        title: "recovery",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, RECOVERY_MIN_DAYS) },
      });
    } else if (!recovery) {
      list.push({
        id: "recovery",
        title: "recovery",
        state: { status: "locked", message: "needs a few more missed-then-recovered days to see the pattern." },
      });
    } else {
      const rounded = Math.round(recovery.avgGapDays);
      const dayWord = rounded === 1 ? "a day" : `${rounded} days`;
      list.push({
        id: "recovery",
        title: "recovery",
        state: {
          status: "ready",
          headline: `when you miss, you're usually back within ${dayWord}.`,
          surprise: Math.min(1, Math.max(0, (3 - recovery.avgGapDays) / 2)),
        },
      });
    }

    // Habit correlations
    if (habits.length < 2) {
      list.push({
        id: "correlation",
        title: "habit correlations",
        state: { status: "locked", message: "add a second habit to compare." },
      });
    } else if (loggedDayCount < CORRELATION_MIN_DAYS) {
      list.push({
        id: "correlation",
        title: "habit correlations",
        state: { status: "locked", message: daysRemainingMessage(loggedDayCount, CORRELATION_MIN_DAYS) },
      });
    } else if (!correlation) {
      list.push({
        id: "correlation",
        title: "habit correlations",
        state: { status: "locked", message: "still gathering enough overlap between habits." },
      });
    } else {
      list.push({
        id: "correlation",
        title: "habit correlations",
        state: {
          status: "ready",
          headline: `on days you did ${correlation.a.name}, you also did ${correlation.b.name} ${Math.round(correlation.withRate * 100)}% of the time — vs ${Math.round(correlation.withoutRate * 100)}% otherwise.`,
          surprise: Math.min(1, correlation.diff / 0.5),
        },
      });
    }

    // Seasonal drift
    if (seasonalDrift) {
      list.push({
        id: "seasonalDrift",
        title: "seasonal drift",
        state: {
          status: "ready",
          headline: `${seasonalDrift.deltaPct >= 0 ? "up" : "down"} ${Math.abs(seasonalDrift.deltaPct)}% from ${seasonalDrift.prevName}.`,
          surprise: Math.min(1, Math.abs(seasonalDrift.deltaPct) / 30),
        },
      });
    } else if (nextSeasonCountdown) {
      list.push({
        id: "seasonalDrift",
        title: "seasonal drift",
        state: { status: "locked", message: `${nextSeasonCountdown.days} days until ${nextSeasonCountdown.name}` },
      });
    } else {
      list.push({
        id: "seasonalDrift",
        title: "seasonal drift",
        state: { status: "locked", message: "needs data from a second season." },
      });
    }

    return list;
  }, [
    loggedDayCount,
    weekdayGap,
    bestStreak,
    hasDailyHabit,
    perfectDaysCount,
    momentumDelta,
    recovery,
    habits,
    correlation,
    seasonalDrift,
    nextSeasonCountdown,
  ]);

  const { featured, comingUp } = useMemo(() => {
    const unlocked = insights.filter(
      (i): i is Insight & { state: { status: "ready"; headline: string; surprise: number } } =>
        i.state.status === "ready",
    );
    const correlationInsight = unlocked.find((i) => i.id === "correlation") ?? null;
    const rankedOthers = unlocked
      .filter((i) => i.id !== "correlation")
      .sort((a, b) => b.state.surprise - a.state.surprise);

    const featuredList: Insight[] = correlationInsight ? [correlationInsight] : [];
    const slotsLeft = Math.min(MAX_FEATURED, unlocked.length) - featuredList.length;
    featuredList.push(...rankedOthers.slice(0, Math.max(0, slotsLeft)));

    const overflow = rankedOthers.slice(Math.max(0, slotsLeft));
    const stillLocked = insights.filter((i) => i.state.status === "locked");

    return { featured: featuredList, comingUp: [...overflow, ...stillLocked] };
  }, [insights]);

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
      <h1 className="text-center text-3xl font-semibold tracking-[-0.02em] text-ink">
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
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Insights
        </p>

        {featured.map((insight) =>
          insight.state.status === "ready" ? (
            <div key={insight.id} className="rounded-2xl border border-line bg-card p-4">
              <p className="font-medium text-ink">{insight.title}</p>
              <p className="mt-1 text-sm text-ink">{insight.state.headline}</p>
            </div>
          ) : null,
        )}

        {comingUp.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Coming up
            </p>
            {comingUp.map((insight) => (
              <div key={insight.id} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{insight.title}</span>
                <span className="text-xs text-muted">
                  {insight.state.status === "ready" ? insight.state.headline : insight.state.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
