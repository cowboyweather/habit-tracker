import { startOfLocalDay, toDateKey } from "@/lib/date";

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

export function computeDayStat(
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
