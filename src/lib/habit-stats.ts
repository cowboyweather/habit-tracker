import {
  addDays,
  daysBetween,
  parseDateKey,
  startOfLocalDay,
  startOfWeek,
  toDateKey,
} from "@/lib/date";
import { trailingWeekRate } from "@/lib/habit-progress";

export type HabitRecord = {
  id: string;
  name: string;
  color: string;
  position: number;
  target_type: "daily" | "weekly";
  target_count: number;
  created_at: string;
  archived: boolean;
  archived_at: string | null;
};

export type LogRow = { habit_id: string; log_date: string; done: boolean };
export type DayStat = { active: number; completed: number };

export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// A habit counts as active on a day if it existed by then and, if it's
// since been archived, wasn't archived yet (the archive day itself still
// counts). A currently-archived habit with no archived_at (archived before
// this column existed) is conservatively treated as never active, rather
// than guessed at — see the migration note in 0004_habit_archived_at.sql.
export function isActiveOn(habit: HabitRecord, dateKey: string): boolean {
  const createdKey = toDateKey(startOfLocalDay(new Date(habit.created_at)));
  if (dateKey < createdKey) return false;
  if (habit.archived) {
    if (!habit.archived_at) return false;
    const archivedKey = toDateKey(startOfLocalDay(new Date(habit.archived_at)));
    return dateKey <= archivedKey;
  }
  return true;
}

// active (the denominator) stays bounded by created_at/archived_at — it's
// "how many habits were trackable that day." completed (the numerator)
// counts every real done log for that day, full stop — retroactive logging
// is intentional, so a log dated before a habit's created_at (or after it
// was archived) still counts. That can push completed above active; callers
// that turn this into a ratio should treat that as "cap at full," not
// discard the log.
export function computeDayStat(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  dateKey: string,
): DayStat {
  let active = 0;
  for (const habit of habits) {
    if (isActiveOn(habit, dateKey)) active++;
  }
  const dayLogs = logsByDate.get(dateKey);
  const completed = dayLogs?.filter((l) => l.done).length ?? 0;
  return { active, completed };
}

// The account's creation day isn't actually the earliest day that can have
// a real log — Home's current-week strip lets you toggle any day in the
// calendar week, including ones before the account (or a given habit)
// existed. A day-stat map that started at accountCreated would never even
// compute an entry for such a day, so it'd read as blank no matter what
// computeDayStat says. Start from whichever is earlier: accountCreated, or
// the earliest date that actually has a log.
export function dailyStatsRangeStart(
  accountCreated: Date,
  logsByDate: Map<string, LogRow[]>,
): Date {
  let earliestLogKey: string | null = null;
  for (const key of logsByDate.keys()) {
    if (earliestLogKey === null || key < earliestLogKey) earliestLogKey = key;
  }
  if (earliestLogKey === null) return accountCreated;
  return earliestLogKey < toDateKey(accountCreated)
    ? parseDateKey(earliestLogKey)
    : accountCreated;
}

// ---------------------------------------------------------------------
// Insight calculators. Each is a pure function over habits/logs so it can
// be reasoned about (and eventually tested) independent of the component
// that renders it.
// ---------------------------------------------------------------------

export type BestStreakResult = {
  habit: HabitRecord;
  length: number;
  unit: "days" | "weeks";
};

// Longest-ever run, not the current one — HomeDashboard's streak counters
// walk backward from today and stop at the first break; this scans a
// habit's whole active lifetime (isActiveOn already bounds that to its own
// created_at/archived_at) looking for the best run anywhere in it, daily
// habits in days and weekly habits in consecutive weeks meeting target —
// same two units the old (now-removed) clowder best-streak function used.
// Comparing a day-count directly against a week-count to pick an overall
// "best" is comparing different units, but each number is still stated
// honestly in its own unit, so this doesn't try to invent a conversion.
export function computeBestStreak(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  historyStart: Date,
  today: Date,
): BestStreakResult | null {
  let best: BestStreakResult | null = null;

  for (const habit of habits) {
    if (habit.target_type === "weekly") {
      const weeks = bestWeeklyStreakWeeks(habit, logsByDate, historyStart, today);
      if (weeks >= 2 && (!best || weeks > best.length)) {
        best = { habit, length: weeks, unit: "weeks" };
      }
    } else {
      const days = bestDailyStreakDays(habit, logsByDate, historyStart, today);
      if (days >= 2 && (!best || days > best.length)) {
        best = { habit, length: days, unit: "days" };
      }
    }
  }
  return best;
}

function bestDailyStreakDays(
  habit: HabitRecord,
  logsByDate: Map<string, LogRow[]>,
  historyStart: Date,
  today: Date,
): number {
  let current = 0;
  let best = 0;
  const totalDays = daysBetween(historyStart, today);
  for (let i = 0; i <= totalDays; i++) {
    const key = toDateKey(addDays(historyStart, i));
    if (!isActiveOn(habit, key)) continue;
    const done =
      logsByDate.get(key)?.find((l) => l.habit_id === habit.id)?.done ?? false;
    if (done) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function bestWeeklyStreakWeeks(
  habit: HabitRecord,
  logsByDate: Map<string, LogRow[]>,
  historyStart: Date,
  today: Date,
): number {
  let weekStart = startOfWeek(historyStart);
  const lastWeekStart = startOfWeek(today);
  let current = 0;
  let best = 0;

  while (weekStart.getTime() <= lastWeekStart.getTime()) {
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    let activeAnyDay = false;
    let doneCount = 0;
    for (const d of weekDates) {
      const key = toDateKey(d);
      if (!isActiveOn(habit, key)) continue;
      activeAnyDay = true;
      const done =
        logsByDate.get(key)?.find((l) => l.habit_id === habit.id)?.done ?? false;
      if (done) doneCount++;
    }

    const isCurrentWeek = weekStart.getTime() === lastWeekStart.getTime();
    if (activeAnyDay && doneCount >= habit.target_count) {
      current++;
      if (current > best) best = current;
    } else if (activeAnyDay && !isCurrentWeek) {
      // The current week never breaks a streak while it's still ongoing —
      // same reasoning as HomeDashboard's own current-week streak handling.
      current = 0;
    }
    weekStart = addDays(weekStart, 7);
  }
  return best;
}

// Days this season where every active DAILY habit was done. Weekly habits
// don't participate — a weekly habit isn't supposed to be done every day,
// so folding it into a per-day "did you do everything" check would punish
// it for its own normal cadence rather than measuring anything real.
export function computePerfectDays(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  rangeStart: Date,
  today: Date,
): number {
  const dailyHabits = habits.filter((h) => h.target_type === "daily");
  if (dailyHabits.length === 0) return 0;

  let count = 0;
  const totalDays = daysBetween(rangeStart, today);
  for (let i = 0; i <= totalDays; i++) {
    const key = toDateKey(addDays(rangeStart, i));
    const activeToday = dailyHabits.filter((h) => isActiveOn(h, key));
    if (activeToday.length === 0) continue;
    const allDone = activeToday.every(
      (h) =>
        logsByDate.get(key)?.find((l) => l.habit_id === h.id)?.done ?? false,
    );
    if (allDone) count++;
  }
  return count;
}

export type RecoveryResult = { avgGapDays: number; sampleCount: number };

// Pools every resolved miss (an active-but-not-done day that was later
// followed by a done day) across all DAILY habits — weekly habits don't
// have a meaningful "missed a day" concept the same way. An unresolved
// miss (still ongoing, no return yet) is never counted, since there's no
// gap to measure until it actually resolves.
export function computeRecoveryGap(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  historyStart: Date,
  today: Date,
): RecoveryResult | null {
  const dailyHabits = habits.filter((h) => h.target_type === "daily");
  const gaps: number[] = [];
  const totalDays = daysBetween(historyStart, today);

  for (const habit of dailyHabits) {
    let missLength = 0;
    for (let i = 0; i <= totalDays; i++) {
      const key = toDateKey(addDays(historyStart, i));
      if (!isActiveOn(habit, key)) continue;
      const done =
        logsByDate.get(key)?.find((l) => l.habit_id === habit.id)?.done ??
        false;
      if (done) {
        if (missLength > 0) gaps.push(missLength);
        missLength = 0;
      } else {
        missLength++;
      }
    }
    // A miss still open at the end of the range isn't counted — it hasn't
    // resolved yet, so there's no gap to report.
  }

  if (gaps.length < 3) return null;
  const avgGapDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  return { avgGapDays, sampleCount: gaps.length };
}

export type WeekdayBucket = {
  active: number;
  completed: number;
  trackableDays: number;
  rate: number;
};

export type WeekdayGapResult = {
  weekdayIndex: number;
  dayRatePct: number;
  restRatePct: number;
  direction: "weak" | "strong";
};

// Compares the single most-different weekday against the combined rate of
// the other six — not just the single strongest vs. single weakest day,
// which is a different (and noisier) comparison. Requires every weekday to
// have at least 2 trackable observations before naming one, so it can't
// single out a day it's barely seen.
export function computeWeekdayGap(
  weekdayStats: WeekdayBucket[],
): WeekdayGapResult | null {
  if (weekdayStats.some((b) => b.trackableDays < 2)) return null;

  const totalActive = weekdayStats.reduce((sum, b) => sum + b.active, 0);
  const totalCompleted = weekdayStats.reduce((sum, b) => sum + b.completed, 0);

  let bestIndex = -1;
  let bestGap = 0;
  let bestRestRate = 0;

  for (let i = 0; i < weekdayStats.length; i++) {
    const b = weekdayStats[i];
    const restActive = totalActive - b.active;
    if (restActive === 0) continue;
    const restRate = (totalCompleted - b.completed) / restActive;
    const gap = b.rate - restRate;
    if (bestIndex === -1 || Math.abs(gap) > Math.abs(bestGap)) {
      bestIndex = i;
      bestGap = gap;
      bestRestRate = restRate;
    }
  }

  if (bestIndex === -1) return null;
  return {
    weekdayIndex: bestIndex,
    dayRatePct: Math.round(weekdayStats[bestIndex].rate * 100),
    restRatePct: Math.round(bestRestRate * 100),
    direction: bestGap < 0 ? "weak" : "strong",
  };
}

// Per-habit average rate across a specific set of dates, using the same
// daily-vs-weekly-target math as the cat's mood (trailingWeekRate) rather
// than a flat "done / 7" that would misjudge a weekly habit. A habit only
// contributes if it was active for at least one date in the window.
export function windowAverageRate(
  habits: HabitRecord[],
  logsByDate: Map<string, LogRow[]>,
  windowDates: Date[],
): number | null {
  const contributions: number[] = [];
  for (const habit of habits) {
    const activeDates = windowDates.filter((d) => isActiveOn(habit, toDateKey(d)));
    if (activeDates.length === 0) continue;
    const doneCount = activeDates.reduce((sum, d) => {
      const key = toDateKey(d);
      const done =
        logsByDate.get(key)?.find((l) => l.habit_id === habit.id)?.done ??
        false;
      return sum + (done ? 1 : 0);
    }, 0);
    contributions.push(trailingWeekRate(doneCount, habit));
  }
  if (contributions.length === 0) return null;
  return contributions.reduce((sum, c) => sum + c, 0) / contributions.length;
}
