"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CatSprite, {
  moodFromCompletion,
  momentaryExpression,
  type Expression,
} from "@/components/CatSprite";
import { logout } from "@/lib/auth-actions";
import {
  addDays,
  daysBetween,
  parseDateKey,
  startOfLocalDay,
  startOfWeek,
  toDateKey,
} from "@/lib/date";

type Habit = {
  id: string;
  name: string;
  color: string;
  position: number;
  target_type: "daily" | "weekly";
  target_count: number;
};

type Season = {
  name: string;
  start_date: string;
};

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const STREAK_LOOKBACK_DAYS = 400;
const WEEK_STREAK_LOOKBACK_WEEKS = 104;

function logKey(habitId: string, dateKey: string) {
  return `${habitId}:${dateKey}`;
}

function countDoneInRange(
  habitId: string,
  logs: Record<string, boolean>,
  dates: Date[],
): number {
  return dates.reduce(
    (count, d) => count + (logs[logKey(habitId, toDateKey(d))] ? 1 : 0),
    0,
  );
}

// Only ever walks backward from today, so future-dated logs (now toggleable)
// can never be counted — don't change this to a forward scan.
function computeDailyStreak(
  habitId: string,
  logs: Record<string, boolean>,
  today: Date,
): number {
  let cursor = today;
  if (!logs[logKey(habitId, toDateKey(today))]) {
    cursor = addDays(today, -1);
  }
  let streak = 0;
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    if (logs[logKey(habitId, toDateKey(cursor))]) {
      streak++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

// Walks backward week by week (Sun-Sat). The current week only ever adds to
// the streak (if already met) or is skipped — it never breaks the streak,
// since it hasn't ended yet. Only a fully-elapsed unmet week stops it.
function computeWeeklyStreak(
  habitId: string,
  logs: Record<string, boolean>,
  today: Date,
  targetCount: number,
): number {
  let weekStart = startOfWeek(today);
  const currentWeekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(weekStart, i),
  );
  let streak = 0;
  if (countDoneInRange(habitId, logs, currentWeekDates) >= targetCount) {
    streak++;
  }
  weekStart = addDays(weekStart, -7);

  for (let i = 0; i < WEEK_STREAK_LOOKBACK_WEEKS; i++) {
    const dates = Array.from({ length: 7 }, (_, j) => addDays(weekStart, j));
    if (countDoneInRange(habitId, logs, dates) >= targetCount) {
      streak++;
      weekStart = addDays(weekStart, -7);
    } else {
      break;
    }
  }
  return streak;
}

export function HomeDashboard({
  userId,
  createdAt,
}: {
  userId: string;
  createdAt: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [season, setSeason] = useState<Season | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [momentary, setMomentary] = useState<Expression | null>(null);
  // Rolled once, lazily, the first time the effect below actually runs.
  // null = not rolled yet.
  const blepRoll = useRef<boolean | null>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  // Grace period covers the account's creation day plus the next 6 (7 days
  // total, days 0-6) — day 7 onward is normal, no transition.
  const inGracePeriod = useMemo(() => {
    const createdDay = startOfLocalDay(new Date(createdAt));
    return daysBetween(createdDay, today) < 7;
  }, [createdAt, today]);
  const weekDates = useMemo(() => {
    const start = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [today]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [petRes, habitsRes, logsRes, seasonRes] = await Promise.all([
        supabase
          .from("pets")
          .select("name")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("habits")
          .select("id, name, color, position, target_type, target_count")
          .eq("user_id", userId)
          .eq("archived", false)
          .order("position", { ascending: true }),
        supabase
          .from("logs")
          .select("habit_id, log_date, done")
          .eq("user_id", userId),
        supabase
          .from("seasons")
          .select("name, start_date")
          .lte("start_date", todayKey)
          .gte("end_date", todayKey)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (petRes.error || habitsRes.error || logsRes.error) {
        setLoadError("Couldn't load your data. Try refreshing.");
        setLoading(false);
        return;
      }

      setPetName(petRes.data?.name ?? "Your cat");
      setHabits((habitsRes.data as Habit[]) ?? []);

      const logMap: Record<string, boolean> = {};
      for (const row of logsRes.data ?? []) {
        logMap[logKey(row.habit_id, row.log_date)] = row.done;
      }
      setLogs(logMap);

      setSeason((seasonRes.data as Season | null) ?? null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, todayKey]);

  // Recomputes on every relevant change (not frozen after the first run) —
  // only the blep roll itself is frozen, via the ref, so a 4% chance only
  // gets rolled once per page load instead of on every re-render. Excited
  // and sleepy are deterministic, so they're allowed to update live; the
  // earlier bug was freezing all three together, which let a stale
  // "excited" silently override the mood display forever, even after a
  // habit was unchecked. Runs in an effect (never during render) so
  // Math.random()/ref reads stay out of SSR and never cause a hydration
  // mismatch — while `loading` is true, this simply doesn't run yet.
  useEffect(() => {
    if (loading) return;

    const allHabitsDoneToday =
      habits.length > 0 &&
      habits.every((h) => logs[logKey(h.id, todayKey)] === true);

    if (blepRoll.current === null) {
      blepRoll.current = Math.random() < 0.04;
    }

    setMomentary(
      momentaryExpression({
        allHabitsDoneToday,
        hour: new Date().getHours(),
        blep: blepRoll.current,
      }),
    );
  }, [loading, habits, logs, todayKey]);

  async function toggleDay(habitId: string, dateKey: string) {
    const key = logKey(habitId, dateKey);
    const wasDone = logs[key] ?? false;
    const nextDone = !wasDone;

    setToggleError(null);
    setLogs((prev) => ({ ...prev, [key]: nextDone }));

    const { error } = await supabase.from("logs").upsert(
      {
        user_id: userId,
        habit_id: habitId,
        log_date: dateKey,
        done: nextDone,
      },
      { onConflict: "habit_id,log_date" },
    );

    if (error) {
      setLogs((prev) => ({ ...prev, [key]: wasDone }));
      setToggleError("Couldn't save that — try again.");
    }
  }

  const dayNumber = season
    ? daysBetween(parseDateKey(season.start_date), today) + 1
    : null;

  const topLine = useMemo(() => {
    const weekday = today
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();
    const month = today
      .toLocaleDateString("en-US", { month: "short" })
      .toUpperCase();
    const dateFragment = `${weekday} ${month} ${today.getDate()}`;
    if (!season || dayNumber === null) return dateFragment;
    const seasonWord = season.name.split(" ")[0].toUpperCase();
    return `${dateFragment} · ${seasonWord}, DAY ${dayNumber}`;
  }, [today, season, dayNumber]);

  const mood = useMemo(() => {
    if (habits.length === 0) return "content" as const;
    // today-6..today only — future-dated logs never enter this window. Both
    // daily and weekly habits use this same rolling window for mood, so a
    // weekly habit's contribution doesn't reset to 0 every Sunday morning —
    // only the displayed "this week" count and streak use the calendar week.
    const trailingStart = addDays(today, -6);
    const trailing7 = Array.from({ length: 7 }, (_, i) =>
      addDays(trailingStart, i),
    );
    const contributions = habits.map((habit) => {
      const done = countDoneInRange(habit.id, logs, trailing7);
      return habit.target_type === "weekly"
        ? Math.min(1, done / habit.target_count)
        : done / 7;
    });
    const rate =
      contributions.reduce((sum, c) => sum + c, 0) / contributions.length;
    return moodFromCompletion(rate);
  }, [habits, logs, today]);

  // New-user grace period: floors low moods up to "content" for the first 7
  // days, so a rough first week doesn't greet a brand-new user with a
  // restless/scruffy cat. Only floors — happy stays happy, never pulled down.
  const flooredMood = useMemo(() => {
    if (inGracePeriod && (mood === "restless" || mood === "scruffy")) {
      return "content" as const;
    }
    return mood;
  }, [inGracePeriod, mood]);

  // The sprite shows the momentary expression when there is one; the label
  // underneath shows the floored mood too — a new user shouldn't see
  // "restless" in text while the sprite reads content.
  const displayExpression = momentary ?? flooredMood;

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] items-center justify-center px-4">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] items-center justify-center px-4">
        <p className="text-sm text-red-500/80">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {topLine}
        </p>
        <form action={logout}>
          <button className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:text-ink">
            Sign out
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-ink p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sky/70">
          This week you are
        </p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">
          New here — let&apos;s get started
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand p-6">
          <CatSprite expression={displayExpression} size={140} />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {petName} · {flooredMood}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            This week
          </p>
          <Link
            href="/habits"
            className="text-xs font-medium text-accent transition hover:text-accent/80"
          >
            Manage habits
          </Link>
        </div>

        {toggleError && (
          <p className="text-xs text-red-500/80">{toggleError}</p>
        )}

        {habits.length === 0 && (
          <p className="text-sm text-muted">No habits yet.</p>
        )}

        {habits.map((habit) => {
          const isWeekly = habit.target_type === "weekly";
          const dailyStreak = isWeekly
            ? 0
            : computeDailyStreak(habit.id, logs, today);
          const weekCount = isWeekly
            ? countDoneInRange(habit.id, logs, weekDates)
            : 0;
          const weekStreak = isWeekly
            ? computeWeeklyStreak(habit.id, logs, today, habit.target_count)
            : 0;

          return (
            <div
              key={habit.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex items-baseline justify-between">
                <p className="font-medium text-ink">{habit.name}</p>
                <p className="text-sm">
                  {isWeekly ? (
                    <>
                      <span
                        className="font-semibold"
                        style={{ color: habit.color }}
                      >
                        {weekCount}
                      </span>{" "}
                      <span className="text-muted">
                        of {habit.target_count} this week
                      </span>
                      {weekStreak > 1 && (
                        <span className="text-muted">
                          {" "}
                          · {weekStreak} week streak
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span
                        className="font-semibold"
                        style={{ color: habit.color }}
                      >
                        {dailyStreak}
                      </span>{" "}
                      <span className="text-muted">day streak</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex justify-between">
                {weekDates.map((d, i) => {
                  const dateKey = toDateKey(d);
                  const isFuture = d.getTime() > today.getTime();
                  const isToday = dateKey === todayKey;
                  const done = logs[logKey(habit.id, dateKey)] ?? false;

                  return (
                    <div
                      key={dateKey}
                      className="flex flex-col items-center gap-1"
                    >
                      <span className="font-mono text-[9px] uppercase text-muted">
                        {WEEKDAY_LETTERS[i]}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDay(habit.id, dateKey)}
                        className={`h-9 w-9 rounded-full border transition active:scale-90 ${
                          done
                            ? "border-transparent"
                            : isFuture
                              ? "border-dashed border-line hover:border-accent"
                              : "border-line bg-card hover:border-accent"
                        }`}
                        style={
                          done ? { backgroundColor: habit.color } : undefined
                        }
                      />
                      <span
                        className={`h-1 w-1 rounded-full ${
                          isToday ? "bg-ink" : "bg-transparent"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
