import { parseDateKey, startOfLocalDay, toDateKey } from "@/lib/date";

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
