import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import { isActiveOn, WEEKDAY_NAMES, type HabitRecord, type LogRow } from "@/lib/habit-stats";

// Shown (never stored) when the week had habits but zero check-ins — no API
// call. Not persisted, so backfilling logs into that week later still earns
// a real title on the next open.
export const EMPTY_WEEK_LINE = "quiet week. the cat kept your seat warm.";
// Shown (never stored) when generation fails; retried on the next open.
export const FAILED_TITLE_LINE = "your title is still brewing";
// No habit existed during last week at all — a brand-new account.
export const NEW_USER_LINE = "new here — let's get started";

// Weekly versions of the season recap's thin rule (season-recap.ts): same
// 25% completion floor, check-in floor scaled down to a single week.
const THIN_WEEK_COMPLETION_THRESHOLD = 0.25;
const THIN_WEEK_CHECKIN_FLOOR = 4;
// Week-over-week change under this many points reads as "flat".
const FLAT_BAND_POINTS = 5;

export type HabitHit = { name: string; done: number; expected: number };

export type WeeklyTitleStats = {
  weekStart: string;
  weekEnd: string;
  checkIns: number;
  completionRate: number; // 0-100, whole points
  strongestDay: string | null;
  weakestDay: string | null;
  longestStreak: { habitName: string; days: number; personalBest: boolean } | null;
  mostHit: HabitHit | null;
  leastHit: HabitHit | null;
  vsLastWeek: { direction: "up" | "down" | "flat"; points: number } | null;
  lastWeekCheckIns: number | null;
  thin: boolean;
};

export type WeeklyTitleOutcome =
  | { kind: "new" }
  | { kind: "empty" }
  | { kind: "stats"; stats: WeeklyTitleStats };

// The Sunday that starts the most recently completed Sun-Sat week.
export function previousWeekStart(today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - d.getDay() - 7);
  return d;
}

function weekKeys(weekStartKey: string): string[] {
  const start = parseDateKey(weekStartKey);
  return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(start, i)));
}

function doneSet(habitId: string, logs: LogRow[]): Set<string> {
  return new Set(logs.filter((l) => l.habit_id === habitId && l.done).map((l) => l.log_date));
}

// Per-habit hits against what the week asked of it: daily habits against
// the days they were trackable, weekly habits against their target (same
// rule as Insights and the rings). Habits not trackable on any day of the
// week are left out entirely.
function habitHits(habits: HabitRecord[], logs: LogRow[], keys: string[]) {
  const hits: (HabitHit & { rate: number })[] = [];
  for (const habit of habits) {
    const activeDays = keys.filter((k) => isActiveOn(habit, k)).length;
    if (activeDays === 0) continue;
    const done = keys.filter((k) => doneSet(habit.id, logs).has(k)).length;
    const expected = habit.target_type === "weekly" ? habit.target_count : activeDays;
    hits.push({ name: habit.name, done, expected, rate: Math.min(1, done / expected) });
  }
  return hits;
}

function averageRate(hits: { rate: number }[]): number | null {
  if (hits.length === 0) return null;
  return hits.reduce((sum, h) => sum + h.rate, 0) / hits.length;
}

// Only named when it's unambiguous — a tie for top (or bottom) says nothing.
function uniqueExtreme<T>(items: T[], value: (t: T) => number, pick: "max" | "min"): T | null {
  if (items.length < 2) return null;
  const target = pick === "max" ? Math.max(...items.map(value)) : Math.min(...items.map(value));
  const matches = items.filter((i) => value(i) === target);
  return matches.length === 1 ? matches[0] : null;
}

// Longest daily-habit run that touches the week, counted back through all
// prior history (so a 14-day streak reads as 14, not the 7 inside the
// week). personalBest = no longer run of that habit before this week ended.
function longestStreak(
  habits: HabitRecord[],
  logs: LogRow[],
  keys: string[],
): WeeklyTitleStats["longestStreak"] {
  const weekEnd = keys[6];
  let best: WeeklyTitleStats["longestStreak"] = null;

  for (const habit of habits) {
    if (habit.target_type !== "daily") continue;
    const done = doneSet(habit.id, logs);
    const sorted = [...done].filter((k) => k <= weekEnd).sort();
    if (sorted.length === 0) continue;

    let allTimeBest = 0;
    let touchingBest = 0;
    let runLength = 0;
    let prev: string | null = null;
    for (const key of sorted) {
      runLength = prev && toDateKey(addDays(parseDateKey(prev), 1)) === key ? runLength + 1 : 1;
      allTimeBest = Math.max(allTimeBest, runLength);
      if (key >= keys[0]) touchingBest = Math.max(touchingBest, runLength);
      prev = key;
    }

    if (touchingBest >= 2 && (!best || touchingBest > best.days)) {
      best = {
        habitName: habit.name,
        days: touchingBest,
        personalBest: touchingBest === allTimeBest,
      };
    }
  }
  return best;
}

// Pure — the caller loads every habit (archived included, so their history
// still counts) and every log dated up to the week's end.
export function computeWeeklyTitleStats(
  habits: HabitRecord[],
  logs: LogRow[],
  weekStartKey: string,
): WeeklyTitleOutcome {
  const keys = weekKeys(weekStartKey);
  const lastWeekKeys = weekKeys(toDateKey(addDays(parseDateKey(weekStartKey), -7)));

  const weekLogs = logs.filter((l) => l.done && l.log_date >= keys[0] && l.log_date <= keys[6]);
  const hits = habitHits(habits, logs, keys);

  if (hits.length === 0 && weekLogs.length === 0) return { kind: "new" };
  if (weekLogs.length === 0) return { kind: "empty" };

  // A backfilled log against a habit that wasn't trackable that week leaves
  // hits empty — same "cap rather than hide" default as the season recap.
  const rate = averageRate(hits) ?? 1;
  const completionRate = Math.round(rate * 100);

  const dayCounts = keys.map((k, i) => ({
    name: WEEKDAY_NAMES[i],
    count: weekLogs.filter((l) => l.log_date === k).length,
  }));
  const strongest = uniqueExtreme(dayCounts, (d) => d.count, "max");
  const weakest = uniqueExtreme(dayCounts, (d) => d.count, "min");

  const mostHit = uniqueExtreme(hits, (h) => h.rate, "max");
  const leastHit = uniqueExtreme(hits, (h) => h.rate, "min");

  const lastWeekHits = habitHits(habits, logs, lastWeekKeys);
  const lastWeekRate = averageRate(lastWeekHits);
  let vsLastWeek: WeeklyTitleStats["vsLastWeek"] = null;
  if (lastWeekRate !== null) {
    const points = completionRate - Math.round(lastWeekRate * 100);
    vsLastWeek = {
      direction: points >= FLAT_BAND_POINTS ? "up" : points <= -FLAT_BAND_POINTS ? "down" : "flat",
      points: Math.abs(points),
    };
  }
  const lastWeekCheckIns =
    lastWeekRate === null
      ? null
      : logs.filter((l) => l.done && l.log_date >= lastWeekKeys[0] && l.log_date <= lastWeekKeys[6]).length;

  const stripHit = (h: (typeof hits)[number] | null): HabitHit | null =>
    h ? { name: h.name, done: h.done, expected: h.expected } : null;

  return {
    kind: "stats",
    stats: {
      weekStart: keys[0],
      weekEnd: keys[6],
      checkIns: weekLogs.length,
      completionRate,
      strongestDay: strongest && strongest.count > 0 ? strongest.name : null,
      weakestDay: weakest ? weakest.name : null,
      longestStreak: longestStreak(habits, logs, keys),
      mostHit: stripHit(mostHit),
      leastHit: stripHit(leastHit),
      vsLastWeek,
      lastWeekCheckIns,
      thin: rate < THIN_WEEK_COMPLETION_THRESHOLD || weekLogs.length < THIN_WEEK_CHECKIN_FLOOR,
    },
  };
}

// Model output → a displayable title, or null to reject. 1-5 words; keeps
// ! ? ... and in-word apostrophes; strips quotation marks; all caps is kept
// only when the whole title is caps, otherwise forced lowercase.
export function cleanTitle(raw: string): string | null {
  // More than one line means preamble ("here's your title:") — reject and retry.
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length !== 1) return null;
  let t = lines[0];
  t = t.replace(/["“”«»]/g, "").trim();
  // Wrapping single quotes only — apostrophes inside words ("monday's") stay.
  t = t.replace(/^['‘’](.*)['‘’]$/, "$1").trim();
  t = t.replace(/\s+/g, " ");
  // A lone trailing period reads as a sentence, not a title; "..." stays.
  if (/[^.]\.$/.test(t)) t = t.slice(0, -1);

  if (t.length === 0 || t.length > 48) return null;
  if (!/^[\p{L}\p{N} '’!?.,:\-&]+$/u.test(t)) return null;
  const words = t.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 1 || words.length > 5 || t.split(" ").length > 5) return null;

  const letters = t.replace(/[^\p{L}]/gu, "");
  const allCaps = letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  return allCaps ? t : t.toLowerCase();
}
