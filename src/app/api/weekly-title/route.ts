import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import type { HabitRecord, LogRow } from "@/lib/habit-stats";
import { cleanTitle, computeWeeklyTitleStats } from "@/lib/weekly-title";
import { formatStatsForPrompt, WEEKLY_TITLE_SYSTEM_PROMPT } from "@/lib/weekly-title-prompt";

const MODEL = "claude-sonnet-5-5";

type Result =
  | { kind: "title"; text: string }
  | { kind: "new" }
  | { kind: "empty" }
  | { kind: "failed" };

function json(result: Result, status = 200) {
  return Response.json(result, { status });
}

// The client says which week just ended (only it knows its own timezone).
// Accept only a Sunday whose week has ended somewhere on Earth — UTC+14 is
// at most a day ahead of the server — and not older than two weeks back.
function isValidWeekStart(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const start = parseDateKey(key);
  if (toDateKey(start) !== key || start.getDay() !== 0) return false;
  const now = new Date();
  const serverToday = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekEndedBy = addDays(start, 7);
  return weekEndedBy <= addDays(serverToday, 1) && start >= addDays(serverToday, -15);
}

async function generateTitle(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("weekly title: ANTHROPIC_API_KEY is not set");
    return null;
  }
  const client = new Anthropic({ apiKey, timeout: 15000, maxRetries: 1 });

  // One retry on an off-voice reply (too long, stray characters) before
  // giving up for this open.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 40,
        system: WEEKLY_TITLE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      const cleaned = cleanTitle(text);
      if (cleaned) return cleaned;
      console.error("weekly title: rejected model output", JSON.stringify(text));
    } catch (error) {
      console.error("weekly title: generation failed", error);
      return null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const weekStart = body?.weekStart;
  if (!isValidWeekStart(weekStart)) {
    return Response.json({ error: "invalid week" }, { status: 400 });
  }
  const weekEnd = toDateKey(addDays(parseDateKey(weekStart), 6));

  const { data: existing, error: existingError } = await supabase
    .from("titles")
    .select("title_text")
    .eq("user_id", user.id)
    .eq("period_type", "week")
    .eq("period_start", weekStart)
    .maybeSingle();
  if (existingError) return json({ kind: "failed" });
  if (existing) return json({ kind: "title", text: existing.title_text });

  // Every habit, archived included, and every log up to the week's end —
  // streaks need history from before the week, not just inside it.
  const [habitsRes, logsRes] = await Promise.all([
    supabase
      .from("habits")
      .select("id, name, color, position, target_type, target_count, created_at, archived, archived_at")
      .eq("user_id", user.id),
    supabase
      .from("logs")
      .select("habit_id, log_date, done")
      .eq("user_id", user.id)
      .eq("done", true)
      .lte("log_date", weekEnd),
  ]);
  if (habitsRes.error || logsRes.error) return json({ kind: "failed" });

  const outcome = computeWeeklyTitleStats(
    habitsRes.data as HabitRecord[],
    logsRes.data as LogRow[],
    weekStart,
  );
  if (outcome.kind !== "stats") return json({ kind: outcome.kind });

  const title = await generateTitle(formatStatsForPrompt(outcome.stats));
  if (!title) return json({ kind: "failed" });

  // ignoreDuplicates: if another tab won the race, keep its title. Then read
  // the row back rather than trusting the insert — whichever title actually
  // landed is the one both tabs show.
  const { error: insertError } = await supabase.from("titles").upsert(
    {
      user_id: user.id,
      period_type: "week",
      period_start: weekStart,
      period_end: weekEnd,
      title_text: title,
      stats_json: outcome.stats,
    },
    { onConflict: "user_id,period_type,period_start", ignoreDuplicates: true },
  );
  if (insertError) {
    console.error("weekly title: insert failed", insertError);
    return json({ kind: "failed" });
  }

  const { data: stored, error: storedError } = await supabase
    .from("titles")
    .select("title_text")
    .eq("user_id", user.id)
    .eq("period_type", "week")
    .eq("period_start", weekStart)
    .maybeSingle();
  if (storedError || !stored) {
    console.error("weekly title: row missing after insert", storedError);
    return json({ kind: "failed" });
  }
  return json({ kind: "title", text: stored.title_text });
}
