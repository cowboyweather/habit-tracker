"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SeasonRecapStats } from "@/lib/season-recap";

// Recorded on dismiss, not on load — someone who opens the app mid-swipe,
// sees this flash, and closes the tab shouldn't have permanently consumed
// their one recap for the season. Seeing it twice if the write itself fails
// is an accepted trade for that; the redirect always happens regardless of
// whether the upsert succeeds.
export async function dismissSeasonRecap(
  periodStart: string,
  periodEnd: string,
  titleText: string,
  stats: SeasonRecapStats,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("titles").upsert(
      {
        user_id: user.id,
        period_type: "season",
        period_start: periodStart,
        period_end: periodEnd,
        title_text: titleText,
        stats_json: stats,
      },
      { onConflict: "user_id,period_type,period_start" },
    );
  }

  redirect("/");
}

// Preview mode (dev-only, see /season-recap/page.tsx) never writes — it
// shouldn't consume the real one-time slot for whichever season is being
// inspected.
export async function dismissSeasonRecapPreview() {
  redirect("/");
}
