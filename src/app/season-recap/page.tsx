import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeSeasonRecapStats,
  getPendingSeasonRecap,
  pickSeasonRecapTitle,
  type SeasonRow,
} from "@/lib/season-recap";
import { seasonNameFromRow } from "@/lib/season-palette";
import { SeasonRecap } from "@/components/SeasonRecap";
import { dismissSeasonRecap, dismissSeasonRecapPreview } from "./actions";
import type { HabitRecord, LogRow } from "@/lib/habit-stats";

const isDev = process.env.NODE_ENV !== "production";

export default async function SeasonRecapPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Dev-only preview: bypasses "already seen" and "has data" — the point is
  // inspecting the layout for any past season, including an empty one.
  // Gated server-side, not just by the dev panel's own visibility, so the
  // query param can't be used to see someone else's recap in production.
  if (isDev && params.preview) {
    const { data: season } = await supabase
      .from("seasons")
      .select("id, name, start_date, end_date")
      .eq("id", params.preview)
      .maybeSingle();

    if (!season) redirect("/");

    const { habits, logs } = await loadHabitsAndLogs(
      supabase,
      user.id,
      season,
    );
    const stats = computeSeasonRecapStats(habits, logs, season);
    const paletteName = seasonNameFromRow(season.name) ?? "summer";

    return (
      <SeasonRecap
        season={season}
        paletteName={paletteName}
        stats={stats}
        isPreview
        dismissAction={dismissSeasonRecapPreview}
      />
    );
  }

  const season = await getPendingSeasonRecap(supabase, user.id);
  if (!season) redirect("/");

  const { habits, logs } = await loadHabitsAndLogs(supabase, user.id, season);
  const stats = computeSeasonRecapStats(habits, logs, season);
  const paletteName = seasonNameFromRow(season.name) ?? "summer";
  const titleText = pickSeasonRecapTitle(stats.isThin);

  return (
    <SeasonRecap
      season={season}
      paletteName={paletteName}
      stats={stats}
      isPreview={false}
      dismissAction={dismissSeasonRecap.bind(
        null,
        season.start_date,
        season.end_date,
        titleText,
        stats,
      )}
    />
  );
}

async function loadHabitsAndLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  season: Pick<SeasonRow, "start_date" | "end_date">,
): Promise<{ habits: HabitRecord[]; logs: LogRow[] }> {
  const [habitsRes, logsRes] = await Promise.all([
    supabase
      .from("habits")
      .select(
        "id, name, color, position, target_type, target_count, created_at, archived, archived_at",
      )
      .eq("user_id", userId),
    supabase
      .from("logs")
      .select("habit_id, log_date, done")
      .eq("user_id", userId)
      .gte("log_date", season.start_date)
      .lte("log_date", season.end_date),
  ]);

  return {
    habits: (habitsRes.data as HabitRecord[]) ?? [],
    logs: (logsRes.data as LogRow[]) ?? [],
  };
}
