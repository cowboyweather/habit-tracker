"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UnseenNudge = {
  nudge_id: string;
  from_user_id: string;
  from_username: string;
  nudge_date: string;
};

// Refetches whenever Home becomes visible, same as everything else on this
// page — a nudge sent while you were on another panel shouldn't need a
// manual reload to show up here.
export function NudgeBanner({ isActive }: { isActive: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [nudges, setNudges] = useState<UnseenNudge[]>([]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase.rpc("get_my_unseen_nudges");
      if (!cancelled) setNudges((data as UnseenNudge[]) ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, isActive]);

  async function dismiss(nudgeId: string) {
    const prev = nudges;
    setNudges((n) => n.filter((x) => x.nudge_id !== nudgeId));
    const { data, error } = await supabase
      .from("clowder_nudges")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", nudgeId)
      .select("id");
    if (error || !data || data.length === 0) setNudges(prev);
  }

  if (nudges.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {nudges.map((n) => (
        <div
          key={n.nudge_id}
          className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3"
        >
          <p className="text-sm text-ink">{n.from_username} nudged you</p>
          <button
            type="button"
            onClick={() => dismiss(n.nudge_id)}
            className="text-xs font-medium text-muted transition hover:text-ink"
          >
            dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
