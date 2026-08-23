"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { startOfLocalDay, toDateKey } from "@/lib/date";

type PastSeason = { id: string; name: string; end_date: string };

// Dev-only: lists every season that's already ended so the season recap can
// be previewed without waiting for a real boundary. /season-recap itself
// re-checks isDev server-side before honoring ?preview=, so this being
// visible client-side isn't the actual security boundary.
export function SeasonRecapDevPreview() {
  const [seasons, setSeasons] = useState<PastSeason[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const todayKey = toDateKey(startOfLocalDay(new Date()));
      const { data } = await supabase
        .from("seasons")
        .select("id, name, end_date")
        .lt("end_date", todayKey)
        .order("end_date", { ascending: false });
      if (!cancelled) setSeasons((data as PastSeason[]) ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!seasons || seasons.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pt-1 text-[10px] uppercase tracking-wide text-muted">
        Preview recap
      </p>
      {seasons.map((s) => (
        <Link
          key={s.id}
          href={`/season-recap?preview=${s.id}`}
          className="rounded px-3 py-1 text-left text-xs text-ink transition hover:bg-line/60"
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}
