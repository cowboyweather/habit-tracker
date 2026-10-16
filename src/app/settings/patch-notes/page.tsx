import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ReleaseRow = {
  id: string;
  version: string;
  released_at: string;
  title: string;
  body: string;
};

function formatReleaseDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toLowerCase();
}

export default async function PatchNotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("releases")
    .select("id, version, released_at, title, body")
    .order("released_at", { ascending: false })
    .order("created_at", { ascending: false });

  const releases = (data as ReleaseRow[] | null) ?? [];

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-8 px-4 pb-16"
      style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-1">
        <Link
          href="/settings"
          aria-label="back"
          className="flex h-11 w-11 items-center justify-center text-xl text-muted transition hover:text-ink"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          patch notes
        </h1>
      </div>

      {releases.length === 0 ? (
        <p className="text-sm text-muted">nothing published yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {releases.map((release) => (
            <div
              key={release.id}
              className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {release.version} · {formatReleaseDate(release.released_at)}
              </p>
              <p className="font-medium text-ink">{release.title}</p>
              <p className="whitespace-pre-line text-sm text-muted">
                {release.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
