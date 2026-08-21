"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CatSprite, { moodFromCompletion } from "@/components/CatSprite";
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
};

type Season = {
  name: string;
  start_date: string;
};

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const STREAK_LOOKBACK_DAYS = 400;

function logKey(habitId: string, dateKey: string) {
  return `${habitId}:${dateKey}`;
}

function computeStreak(
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

export function HomeDashboard({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [season, setSeason] = useState<Season | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
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
          .select("id, name, color, position")
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

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
  }, []);

  const mood = useMemo(() => {
    if (habits.length === 0) return "content" as const;
    const trailingStart = addDays(today, -6);
    let doneCount = 0;
    for (const habit of habits) {
      for (let i = 0; i < 7; i++) {
        const d = addDays(trailingStart, i);
        if (logs[logKey(habit.id, toDateKey(d))]) doneCount++;
      }
    }
    const rate = doneCount / (habits.length * 7);
    return moodFromCompletion(rate);
  }, [habits, logs, today]);

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

      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
        {greeting}, {username}
      </h1>

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
          <CatSprite expression={mood} size={140} />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {petName} · {mood}
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
          const streak = computeStreak(habit.id, logs, today);
          return (
            <div
              key={habit.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex items-baseline justify-between">
                <p className="font-medium text-ink">{habit.name}</p>
                <p className="text-sm">
                  <span
                    className="font-semibold"
                    style={{ color: habit.color }}
                  >
                    {streak}
                  </span>{" "}
                  <span className="text-muted">day streak</span>
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
                        disabled={isFuture}
                        onClick={() => toggleDay(habit.id, dateKey)}
                        className={`h-9 w-9 rounded-full border transition active:scale-90 ${
                          isFuture
                            ? "cursor-not-allowed border-dashed border-line opacity-50"
                            : done
                              ? "border-transparent"
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
