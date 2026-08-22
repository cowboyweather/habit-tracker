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
import {
  isActiveOn,
  computeDayStat,
  WEEKDAY_LETTERS,
  type HabitRecord,
  type LogRow,
  type DayStat,
} from "@/lib/habit-stats";
import { trailingWeekRate } from "@/lib/habit-progress";
import { HabitRings } from "@/components/HabitRings";

type Tier = "blank" | "none" | "some" | "most" | "all";

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

export function CalendarPanel({
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
  const [retryToken, setRetryToken] = useState(0);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const accountCreated = useMemo(
    () => startOfLocalDay(new Date(createdAt)),
    [createdAt],
  );

  const [viewedYear, setViewedYear] = useState(() => today.getFullYear());
  const [viewedMonth, setViewedMonth] = useState(() => today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

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
        const [habitsRes, logsRes] = await Promise.all([
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
        ]);

        clearTimeout(timeoutId);
        if (cancelled) return;

        if (habitsRes.error || logsRes.error) {
          setLoadError("couldn't load your data.");
          setLoading(false);
          return;
        }

        setHabits((habitsRes.data as HabitRecord[]) ?? []);
        setLogs((logsRes.data as LogRow[]) ?? []);
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

  // Same per-habit trailing-7-day rate that drives the cat's mood on Home
  // (src/lib/habit-progress.ts) — the rings explain her state rather than
  // introducing separate math. Capped to 5, matching the onboarding limit;
  // habits beyond that (only reachable via Manage Habits) don't get a ring.
  const ringHabits = useMemo(() => {
    const trailingStart = addDays(today, -6);
    const trailing7Keys = Array.from({ length: 7 }, (_, i) =>
      toDateKey(addDays(trailingStart, i)),
    );
    return habits
      .filter((h) => !h.archived)
      .sort((a, b) => a.position - b.position)
      .slice(0, 5)
      .map((h) => {
        const done = trailing7Keys.reduce((count, key) => {
          const dayLogs = logsByDate.get(key);
          return (
            count +
            (dayLogs?.some((l) => l.habit_id === h.id && l.done) ? 1 : 0)
          );
        }, 0);
        return {
          id: h.id,
          name: h.name,
          color: h.color,
          rate: trailingWeekRate(done, h),
        };
      });
  }, [habits, logsByDate, today]);

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

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <div className="h-8 w-28 animate-pulse rounded bg-line" />

        <div className="flex flex-col items-center gap-3">
          <div className="flex justify-center gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 w-14 animate-pulse rounded-full bg-line"
              />
            ))}
          </div>
          <div className="h-3 w-40 animate-pulse rounded bg-line" />
        </div>

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
        calendar
      </h1>

      {loggedDayCount === 0 && (
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
          this fills in as you log habits — nothing to show yet.
        </p>
      )}

      <HabitRings habits={ringHabits} />

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
    </div>
  );
}
