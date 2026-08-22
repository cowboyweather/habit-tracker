"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addDays,
  daysBetween,
  parseDateKey,
  startOfLocalDay,
  toDateKey,
} from "@/lib/date";

type HabitRecord = {
  id: string;
  name: string;
  color: string;
  target_type: "daily" | "weekly";
  target_count: number;
  created_at: string;
  archived: boolean;
  archived_at: string | null;
};

type LogRow = { habit_id: string; log_date: string; done: boolean };
type SeasonRow = { name: string; start_date: string; end_date: string };
type DayStat = { active: number; completed: number };
type Tier = "blank" | "none" | "some" | "most" | "all";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const CORRELATION_DAYS_NEEDED = 21;
const CORRELATION_MIN_SAMPLE = 3;

// A habit counts as active on a day if it existed by then and, if it's
// since been archived, wasn't archived yet (the archive day itself still
// counts). A currently-archived habit with no archived_at (archived before
// this column existed) is conservatively treated as never active, rather
// than guessed at — see the migration note in 0004_habit_archived_at.sql.
function isActiveOn(habit: HabitRecord, dateKey: string): boolean {
  const createdKey = toDateKey(startOfLocalDay(new Date(habit.created_at)));
  if (dateKey < createdKey) return false;
  if (habit.archived) {
    if (!habit.archived_at) return false;
    const archivedKey = toDateKey(startOfLocalDay(new Date(habit.archived_at)));
    return dateKey <= archivedKey;
  }
  return true;
}

function computeDayStat(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  dateKey: string,
): DayStat {
  let active = 0;
  let completed = 0;
  const dayLogs = logsByDate.get(dateKey);
  for (const habit of habits) {
    if (!isActiveOn(habit, dateKey)) continue;
    active++;
    if (dayLogs?.find((l) => l.habit_id === habit.id)?.done) completed++;
  }
  return { active, completed };
}

function shadeTier(stat: DayStat): Tier {
  if (stat.active === 0) return "blank";
  const ratio = stat.completed / stat.active;
  if (ratio === 0) return "none";
  if (ratio < 0.5) return "some";
  if (ratio < 1) return "most";
  return "all";
}

const TIER_CLASSES: Record<Tier, string> = {
  blank: "",
  none: "bg-card border border-line",
  some: "bg-accent/20",
  most: "bg-accent/55",
  all: "bg-accent/90",
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
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

  const [viewedYear, setViewedYear] = useState(() => today.getFullYear());
  const [viewedMonth, setViewedMonth] = useState(() => today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Refetches every time this panel actually becomes visible, not just on
  // mount — SwipeShell mounts all three panels simultaneously, so a fetch
  // on mount alone would go stale the moment you mark something on Home
  // and then swipe over here. Deliberately doesn't reset loading/loadError
  // first: a background refresh silently swaps in new data once it
  // resolves, rather than flashing the skeleton on every revisit.
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
              "id, name, color, target_type, target_count, created_at, archived, archived_at",
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
  // both the calendar (a month slice) and the weekday bars (all of it).
  const dailyStats = useMemo(() => {
    const map = new Map<string, DayStat>();
    const totalDays = daysBetween(accountCreated, today);
    for (let i = 0; i <= totalDays; i++) {
      const key = toDateKey(addDays(accountCreated, i));
      map.set(key, computeDayStat(habits, logsByDate, key));
    }
    return map;
  }, [habits, logsByDate, accountCreated, today]);

  const loggedDayKeys = useMemo(
    () => new Set(logs.map((l) => l.log_date)),
    [logs],
  );
  const loggedDayCount = loggedDayKeys.size;

  const monthCells = useMemo(
    () => buildMonthGrid(viewedYear, viewedMonth),
    [viewedYear, viewedMonth],
  );

  const monthSummary = useMemo(() => {
    let trackable = 0;
    let withActivity = 0;
    for (const cell of monthCells) {
      if (!cell || cell.getTime() > today.getTime()) continue;
      const stat = dailyStats.get(toDateKey(cell));
      if (!stat || stat.active === 0) continue;
      trackable++;
      if (stat.completed > 0) withActivity++;
    }
    return { trackable, withActivity };
  }, [monthCells, dailyStats, today]);

  const canGoPrev =
    viewedYear > accountCreated.getFullYear() ||
    (viewedYear === accountCreated.getFullYear() &&
      viewedMonth > accountCreated.getMonth());
  const canGoNext =
    viewedYear < today.getFullYear() ||
    (viewedYear === today.getFullYear() && viewedMonth < today.getMonth());

  function goPrevMonth() {
    if (!canGoPrev) return;
    setSelectedDateKey(null);
    if (viewedMonth === 0) {
      setViewedYear((y) => y - 1);
      setViewedMonth(11);
    } else {
      setViewedMonth((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (!canGoNext) return;
    setSelectedDateKey(null);
    if (viewedMonth === 11) {
      setViewedYear((y) => y + 1);
      setViewedMonth(0);
    } else {
      setViewedMonth((m) => m + 1);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) goNextMonth();
    else goPrevMonth();
  }

  const selectedDetail = useMemo(() => {
    if (!selectedDateKey) return null;
    const dayLogs = logsByDate.get(selectedDateKey) ?? [];
    const items = habits
      .filter((h) => isActiveOn(h, selectedDateKey))
      .map((h) => ({
        habit: h,
        done: dayLogs.find((l) => l.habit_id === h.id)?.done ?? false,
      }));
    return { items };
  }, [selectedDateKey, logsByDate, habits]);

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
          <div className="flex items-center justify-between">
            <div className="h-6 w-6 animate-pulse rounded bg-line" />
            <div className="h-5 w-32 animate-pulse rounded bg-line" />
            <div className="h-6 w-6 animate-pulse rounded bg-line" />
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-lg bg-line"
              />
            ))}
          </div>
        </div>

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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goPrevMonth}
            disabled={!canGoPrev}
            aria-label="previous month"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition hover:bg-line/60 active:scale-90 disabled:pointer-events-none disabled:text-muted/40"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-semibold text-ink">
              {MONTH_NAMES[viewedMonth]} {viewedYear}
            </p>
            <p className="text-xs text-muted">
              {monthSummary.withActivity} of {monthSummary.trackable} days
            </p>
            {!canGoPrev && (
              <p className="mt-1 text-[11px] text-muted">
                history starts{" "}
                {accountCreated
                  .toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toLowerCase()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={goNextMonth}
            disabled={!canGoNext}
            aria-label="next month"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition hover:bg-line/60 active:scale-90 disabled:pointer-events-none disabled:text-muted/40"
          >
            ›
          </button>
        </div>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="grid grid-cols-7 gap-1.5"
        >
          {WEEKDAY_LETTERS.map((l, i) => (
            <div
              key={i}
              className="text-center font-mono text-[9px] uppercase text-muted"
            >
              {l}
            </div>
          ))}
          {monthCells.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const key = toDateKey(cell);
            const isFuture = cell.getTime() > today.getTime();
            const stat = dailyStats.get(key);
            const tier: Tier = isFuture || !stat ? "blank" : shadeTier(stat);
            const isSelected = key === selectedDateKey;
            const disabled = isFuture || tier === "blank";

            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setSelectedDateKey(key === selectedDateKey ? null : key)
                }
                className={`aspect-square rounded-lg text-xs transition ${TIER_CLASSES[tier]} ${
                  isSelected ? "ring-2 ring-accent" : ""
                } ${tier === "most" || tier === "all" ? "text-white" : "text-ink"} ${
                  disabled ? "cursor-default" : "active:scale-90"
                }`}
              >
                {cell.getDate()}
              </button>
            );
          })}
        </div>

        {selectedDetail && selectedDateKey && (
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {parseDateKey(selectedDateKey).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            {selectedDetail.items.length === 0 ? (
              <p className="text-sm text-muted">
                no habits were being tracked yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {selectedDetail.items.map(({ habit, done }) => (
                  <li
                    key={habit.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">
                      {habit.name}
                      {habit.target_type === "weekly" && (
                        <span className="text-muted"> (weekly)</span>
                      )}
                    </span>
                    <span
                      className={done ? "font-semibold" : "text-muted"}
                      style={done ? { color: habit.color } : undefined}
                    >
                      {done ? "done" : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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
