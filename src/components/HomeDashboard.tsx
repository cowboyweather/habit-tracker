"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CatSprite, {
  moodFromCompletion,
  momentaryExpression,
  type Expression,
  type Breed,
} from "@/components/CatSprite";
import { trailingWeekRate } from "@/lib/habit-progress";
import { NudgeBanner } from "@/components/NudgeBanner";
import { BreedPicker } from "@/components/BreedPicker";
import { SettingsIcon } from "@/components/icons";
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

type ReleaseRow = {
  id: string;
  version: string;
  released_at: string;
  title: string;
  body: string;
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
  isActive,
  onSheetOpenChange,
}: {
  userId: string;
  createdAt: string;
  isActive: boolean;
  /** Lets SwipeShell suspend its own horizontal scroll while a sheet here is open. */
  onSheetOpenChange: (open: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [breed, setBreed] = useState<Breed>("munchkin");
  const [season, setSeason] = useState<Season | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [breedError, setBreedError] = useState<string | null>(null);
  const [breedSheetOpen, setBreedSheetOpen] = useState(false);
  // The single newest release, only when the signed-in user hasn't
  // acknowledged it yet (null otherwise — nothing to show).
  const [unseenRelease, setUnseenRelease] = useState<ReleaseRow | null>(null);

  useEffect(() => {
    onSheetOpenChange(breedSheetOpen || unseenRelease !== null);
  }, [breedSheetOpen, unseenRelease, onSheetOpenChange]);
  const [momentary, setMomentary] = useState<Expression | null>(null);
  // Rolled once, lazily, the first time the effect below actually runs.
  // null = not rolled yet.
  const blepRoll = useRef<boolean | null>(null);
  // Bumped by the retry button to re-trigger the load effect below.
  const [retryToken, setRetryToken] = useState(0);

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

  // Refetches every time Home actually becomes visible, not just on mount —
  // otherwise a toggle made from Calendar's day-detail (or Insights) would
  // leave the cat's mood stale until a manual reload, since SwipeShell
  // mounts every panel simultaneously. Mirrors the same pattern already
  // used by CalendarPanel/InsightsPanel.
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    async function load() {
      // A genuine network failure (offline, DNS failure) doesn't reject the
      // Supabase calls promptly — testing found they just retry silently at
      // the network layer without ever resolving or rejecting. A try/catch
      // alone can't help if the promise never settles, so this imposes an
      // explicit timeout via AbortController, which properly cancels the
      // underlying fetch (and does reliably reject) rather than just
      // ignoring whatever the hung request eventually does.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const [petRes, habitsRes, logsRes, seasonRes, releaseRes, releaseStateRes] =
          await Promise.all([
            supabase
              .from("pets")
              .select("name, breed")
              .eq("user_id", userId)
              .abortSignal(controller.signal)
              .maybeSingle(),
            supabase
              .from("habits")
              .select("id, name, color, position, target_type, target_count")
              .eq("user_id", userId)
              .eq("archived", false)
              .order("position", { ascending: true })
              .abortSignal(controller.signal),
            supabase
              .from("logs")
              .select("habit_id, log_date, done")
              .eq("user_id", userId)
              .abortSignal(controller.signal),
            supabase
              .from("seasons")
              .select("name, start_date")
              .lte("start_date", todayKey)
              .gte("end_date", todayKey)
              .abortSignal(controller.signal)
              .maybeSingle(),
            // Release notes are a nice-to-have overlay, not core data — a
            // failure here (including the table not existing yet, before
            // its migration has run) is handled on its own below rather
            // than failing the whole page load.
            supabase
              .from("releases")
              .select("id, version, released_at, title, body")
              .order("released_at", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .abortSignal(controller.signal)
              .maybeSingle(),
            supabase
              .from("user_release_state")
              .select("last_seen_release_id")
              .eq("user_id", userId)
              .abortSignal(controller.signal)
              .maybeSingle(),
          ]);

        clearTimeout(timeoutId);
        if (cancelled) return;

        if (petRes.error || habitsRes.error || logsRes.error) {
          setLoadError("couldn't load your data.");
          setLoading(false);
          return;
        }

        setPetName(petRes.data?.name ?? "your cat");
        setBreed((petRes.data?.breed as Breed) ?? "munchkin");
        setHabits((habitsRes.data as Habit[]) ?? []);

        const logMap: Record<string, boolean> = {};
        for (const row of logsRes.data ?? []) {
          logMap[logKey(row.habit_id, row.log_date)] = row.done;
        }
        setLogs(logMap);

        setSeason((seasonRes.data as Season | null) ?? null);

        const newestRelease = releaseRes.data as ReleaseRow | null;
        const lastSeenId = releaseStateRes.data?.last_seen_release_id ?? null;
        setUnseenRelease(
          !releaseRes.error && newestRelease && newestRelease.id !== lastSeenId
            ? newestRelease
            : null,
        );

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
  }, [supabase, userId, todayKey, retryToken, isActive]);

  // Resets to the loading state and bumps retryToken to re-run the effect
  // above. Done here (an event handler), not inside the effect itself, so
  // there's no synchronous setState in the effect body.
  function retry() {
    setLoading(true);
    setLoadError(null);
    setRetryToken((t) => t + 1);
  }

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

  async function handleBreedChange(nextBreed: Breed) {
    const previousBreed = breed;
    setBreedError(null);
    setBreed(nextBreed); // optimistic
    setBreedSheetOpen(false);

    const { data, error } = await supabase
      .from("pets")
      .update({ breed: nextBreed })
      .eq("user_id", userId)
      .select("id");

    if (error || !data || data.length === 0) {
      setBreed(previousBreed);
      setBreedError("couldn't save that coat — try again.");
    }
  }

  // Dismisses immediately — the whole point is this never blocks getting
  // to the actual logging UI underneath. If the write fails, the only
  // consequence is the same notice showing again next time Home loads,
  // which is a fine failure mode here.
  function handleDismissRelease() {
    if (!unseenRelease) return;
    const releaseId = unseenRelease.id;
    setUnseenRelease(null);
    void supabase
      .from("user_release_state")
      .upsert({ user_id: userId, last_seen_release_id: releaseId });
  }

  async function toggleDay(habitId: string, dateKey: string) {
    const key = logKey(habitId, dateKey);
    const wasDone = logs[key] ?? false;
    const nextDone = !wasDone;

    setToggleError(null);
    setLogs((prev) => ({ ...prev, [key]: nextDone }));

    const { data, error } = await supabase
      .from("logs")
      .upsert(
        {
          user_id: userId,
          habit_id: habitId,
          log_date: dateKey,
          done: nextDone,
        },
        { onConflict: "habit_id,log_date" },
      )
      .select("id");

    if (error || !data || data.length === 0) {
      setLogs((prev) => ({ ...prev, [key]: wasDone }));
      setToggleError("couldn't save that — try again.");
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
      return trailingWeekRate(done, habit);
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

  // With zero habits, the sprite is always content — she's the reason to be
  // here, not a reflection of data that doesn't exist yet. Otherwise, the
  // sprite shows the momentary expression when there is one; the label
  // underneath shows the floored mood too — a new user shouldn't see
  // "restless" in text while the sprite reads content.
  const displayExpression =
    habits.length === 0 ? "content" : (momentary ?? flooredMood);

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <div className="h-3 w-36 animate-pulse rounded bg-line" />
          <Link
            href="/settings"
            aria-label="settings"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink"
          >
            <SettingsIcon />
          </Link>
        </div>

        <div className="rounded-2xl bg-ink p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sky/70">
            This week you are
          </p>
          <div className="mt-3 h-5 w-44 animate-pulse rounded bg-white/20" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex min-h-[192px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand p-6" />
          <div className="h-3 w-28 animate-pulse rounded bg-line" />
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
              manage habits
            </Link>
          </div>

          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex items-baseline justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-line" />
                <div className="h-4 w-20 animate-pulse rounded bg-line" />
              </div>
              <div className="flex justify-between">
                {weekDates.map((d) => (
                  <div
                    key={toDateKey(d)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="font-mono text-[9px] uppercase text-transparent">
                      S
                    </span>
                    <div className="h-9 w-9 animate-pulse rounded-full bg-line" />
                    <span className="h-1 w-1 rounded-full bg-transparent" />
                  </div>
                ))}
              </div>
            </div>
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
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {topLine}
        </p>
        <Link
          href="/settings"
          aria-label="settings"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink"
        >
          <SettingsIcon />
        </Link>
      </div>

      <NudgeBanner isActive={isActive} />

      <div className="rounded-2xl bg-ink p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sky/70">
          This week you are
        </p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">
          new here — let&apos;s get started
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setBreedSheetOpen(true)}
          aria-label="change coat"
          className="relative flex min-h-[192px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand p-6 transition active:scale-[0.98]"
        >
          <CatSprite breed={breed} expression={displayExpression} size={140} />
          <span className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 shadow-sm">
            <SwatchIcon size={14} />
          </span>
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {petName} · {flooredMood}
        </p>
        {breedError && (
          <p className="text-xs text-red-500/80">{breedError}</p>
        )}
      </div>

      {breedSheetOpen && (
        <BreedSheet
          value={breed}
          onChange={handleBreedChange}
          onClose={() => setBreedSheetOpen(false)}
        />
      )}

      {unseenRelease && (
        <ReleaseSheet release={unseenRelease} onDismiss={handleDismissRelease} />
      )}

      <div className="flex flex-col gap-3">
        {habits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 text-center">
            <p className="text-sm text-muted">
              you haven&apos;t tracked anything yet.
            </p>
            <Link
              href="/habits"
              className="flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
            >
              add your first habit
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                This week
              </p>
              <Link
                href="/habits"
                className="text-xs font-medium text-accent transition hover:text-accent/80"
              >
                manage habits
              </Link>
            </div>

            {toggleError && (
              <p className="text-xs text-red-500/80">{toggleError}</p>
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
                              done
                                ? { backgroundColor: habit.color }
                                : undefined
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
          </>
        )}
      </div>
    </div>
  );
}

// A cluster of swatches, not a full palette-with-thumbhole shape — simpler
// to get right at 14px and still reads clearly as "customize the color."
function SwatchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="8" cy="8" r="4.4" fill="#e07a5f" />
      <circle cx="16" cy="8" r="4.4" fill="#3d8f8f" />
      <circle cx="8" cy="16" r="4.4" fill="#f2cc65" />
      <circle cx="16" cy="16" r="4.4" fill="#4a5f94" />
    </svg>
  );
}

function BreedSheet({
  value,
  onChange,
  onClose,
}: {
  value: Breed;
  onChange: (breed: Breed) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[360px] flex-col gap-4 rounded-t-3xl bg-card p-6 pb-8 sm:rounded-3xl"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-sm font-medium text-ink">
          choose a coat
        </p>
        <BreedPicker value={value} onChange={onChange} />
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 w-full rounded-xl border border-line text-sm font-medium text-ink transition hover:border-accent active:scale-[0.98]"
        >
          close
        </button>
      </div>
    </div>
  );
}

// Dismissible, not a gate — this is the one deliberate exception to every
// other sheet in the app not having its own explicit "x" close button in
// the corner, since a release notice (unlike choosing a coat or leaving a
// clowder) has no action to take; the only thing to do with it is read it
// and move on, so closing it needs to be obvious at a glance, not just
// via the backdrop or a button at the bottom.
function ReleaseSheet({
  release,
  onDismiss,
}: {
  release: { version: string; title: string; body: string };
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onDismiss}
    >
      <div
        className="relative flex w-full max-w-[360px] flex-col gap-4 rounded-t-3xl bg-card p-6 pb-8 sm:rounded-3xl"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-lg text-muted transition hover:text-ink"
        >
          ×
        </button>

        <div className="flex flex-col gap-1 pr-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            what&apos;s new · {release.version}
          </p>
          <p className="text-lg font-semibold tracking-[-0.02em] text-ink">
            {release.title}
          </p>
        </div>

        <p className="whitespace-pre-line text-sm text-ink">{release.body}</p>

        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 w-full rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98]"
        >
          got it
        </button>
      </div>
    </div>
  );
}
