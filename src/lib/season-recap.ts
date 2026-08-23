import { addDays, parseDateKey, startOfLocalDay, startOfWeek, toDateKey } from "@/lib/date";
import {
  computeDayStat,
  WEEKDAY_NAMES,
  type HabitRecord,
  type LogRow,
  type DayStat,
} from "@/lib/habit-stats";
import type { createClient } from "@/lib/supabase/server";

export type SeasonRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

// Mirrors CatSprite's moodFromCompletion "scruffy" floor (rate < 0.25) —
// reusing the app's existing definition of "not much happened" rather than
// inventing a second threshold for the same idea.
export const THIN_SEASON_COMPLETION_THRESHOLD = 0.25;

// A second, independent signal: completionRate alone isn't enough, because
// it can read as artificially high. A habit backfilled into a season it
// didn't exist during has zero "active" days there — completionRate's
// active-denominator is 0, so per the same "cap rather than hide" rule used
// everywhere else, it defaults to 100% regardless of how sparse the actual
// logging was. A single backfilled check-in would otherwise show "100%
// completion" with the celebratory copy. Raw check-in count doesn't have
// that failure mode, so a season is thin if EITHER signal says so.
export const THIN_SEASON_CHECKIN_FLOOR = 15;

// Fixed placeholders — real AI-generated titles come later (ROADMAP Phase
// 3). Exported (rather than kept local to the component) so page.tsx can
// persist the exact string that was actually shown, not recompute it.
export const SEASON_RECAP_TITLE = {
  normal: "A season built one day at a time.",
  thin: "A season that started — and that's enough.",
};

export function pickSeasonRecapTitle(isThin: boolean): string {
  return isThin ? SEASON_RECAP_TITLE.thin : SEASON_RECAP_TITLE.normal;
}

export type SeasonRecapStats = {
  totalCheckIns: number;
  completionRate: number;
  bestStreak: { count: number; unit: "day" | "week"; habitName: string } | null;
  strongestWeekday: string | null;
  isThin: boolean;
};

function dateRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let cursor = parseDateKey(startKey);
  while (toDateKey(cursor) <= endKey) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function longestDailyRun(doneKeys: Set<string>, dayKeys: string[]): number {
  let best = 0;
  let current = 0;
  for (const key of dayKeys) {
    if (doneKeys.has(key)) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

// Weeks are natural Sun-Sat, same convention as HomeDashboard's weekly
// streak — a week counts if enough of its 7 days are done, even if a
// couple of those days fall just outside the season's exact boundary.
function longestWeeklyRun(
  doneKeys: Set<string>,
  targetCount: number,
  seasonStartKey: string,
  seasonEndKey: string,
): number {
  let best = 0;
  let current = 0;
  let weekStart = startOfWeek(parseDateKey(seasonStartKey));
  const seasonEnd = parseDateKey(seasonEndKey);
  while (weekStart.getTime() <= seasonEnd.getTime()) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      if (doneKeys.has(toDateKey(addDays(weekStart, i)))) count++;
    }
    if (count >= targetCount) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    weekStart = addDays(weekStart, 7);
  }
  return best;
}

function computeBestStreak(
  habits: HabitRecord[],
  logs: LogRow[],
  season: { start_date: string; end_date: string },
): SeasonRecapStats["bestStreak"] {
  const dayKeys = dateRange(season.start_date, season.end_date);
  let best: SeasonRecapStats["bestStreak"] = null;

  for (const habit of habits) {
    const doneKeys = new Set(
      logs
        .filter((l) => l.habit_id === habit.id && l.done)
        .map((l) => l.log_date),
    );
    const count =
      habit.target_type === "weekly"
        ? longestWeeklyRun(
            doneKeys,
            habit.target_count,
            season.start_date,
            season.end_date,
          )
        : longestDailyRun(doneKeys, dayKeys);

    if (count > 0 && (!best || count > best.count)) {
      best = {
        count,
        unit: habit.target_type === "weekly" ? "week" : "day",
        habitName: habit.name,
      };
    }
  }

  return best;
}

export function computeSeasonRecapStats(
  habits: HabitRecord[],
  logs: LogRow[],
  season: { start_date: string; end_date: string },
): SeasonRecapStats {
  const logsByDate = new Map<string, LogRow[]>();
  for (const log of logs) {
    const arr = logsByDate.get(log.log_date) ?? [];
    arr.push(log);
    logsByDate.set(log.log_date, arr);
  }

  const dayKeys = dateRange(season.start_date, season.end_date);
  const dailyStats = new Map<string, DayStat>();
  for (const key of dayKeys) {
    dailyStats.set(key, computeDayStat(habits, logsByDate, key));
  }

  let totalActive = 0;
  let totalCompleted = 0;
  const weekdayBuckets = Array.from({ length: 7 }, () => ({
    active: 0,
    completed: 0,
    trackableDays: 0,
  }));

  for (const key of dayKeys) {
    const stat = dailyStats.get(key)!;
    totalActive += stat.active;
    totalCompleted += stat.completed;
    if (stat.active > 0 || stat.completed > 0) {
      const weekday = parseDateKey(key).getDay();
      weekdayBuckets[weekday].active += stat.active;
      weekdayBuckets[weekday].completed += stat.completed;
      weekdayBuckets[weekday].trackableDays += 1;
    }
  }

  // Capped at 100% — a season-level percentage over 100 (possible from
  // retroactive logs pushing completed above active on individual days)
  // would read as a bug, not a flex.
  const completionRate =
    totalActive > 0
      ? Math.min(1, totalCompleted / totalActive)
      : totalCompleted > 0
        ? 1
        : 0;

  const weekdaysWithData = weekdayBuckets
    .map((b, i) => ({
      ...b,
      index: i,
      rate: b.active > 0 ? b.completed / b.active : b.completed > 0 ? 1 : 0,
    }))
    .filter((b) => b.trackableDays > 0);
  const strongestWeekday =
    weekdaysWithData.length < 2
      ? null
      : WEEKDAY_NAMES[
          weekdaysWithData.reduce((a, b) => (b.rate > a.rate ? b : a)).index
        ];

  return {
    totalCheckIns: totalCompleted,
    completionRate,
    bestStreak: computeBestStreak(habits, logs, season),
    strongestWeekday,
    isThin:
      completionRate < THIN_SEASON_COMPLETION_THRESHOLD ||
      totalCompleted < THIN_SEASON_CHECKIN_FLOOR,
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Only ever considers the single most-recently-ended season — someone
// returning after a longer gap gets welcomed back, not handed a backlog of
// recaps for seasons they missed.
export async function getPendingSeasonRecap(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<SeasonRow | null> {
  const todayKey = toDateKey(startOfLocalDay(new Date()));

  const { data: current } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date")
    .lte("start_date", todayKey)
    .gte("end_date", todayKey)
    .maybeSingle();
  if (!current) return null;

  const { data: previous } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date")
    .lt("end_date", current.start_date)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previous) return null;

  const { data: alreadySeen } = await supabase
    .from("titles")
    .select("id")
    .eq("user_id", userId)
    .eq("period_type", "season")
    .eq("period_start", previous.start_date)
    .maybeSingle();
  if (alreadySeen) return null;

  // "Has data" means at least one real log dated inside the season's range
  // — a retroactively-backfilled log still counts as data, since if they
  // logged it, it's theirs.
  const { data: anyLog } = await supabase
    .from("logs")
    .select("id")
    .eq("user_id", userId)
    .gte("log_date", previous.start_date)
    .lte("log_date", previous.end_date)
    .limit(1)
    .maybeSingle();
  if (!anyLog) return null;

  return previous as SeasonRow;
}
