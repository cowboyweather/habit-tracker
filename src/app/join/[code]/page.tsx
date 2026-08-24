import Link from "next/link";
import CatSprite from "@/components/CatSprite";
import { JoinClowderButton } from "@/components/JoinClowderButton";
import { createClient } from "@/lib/supabase/server";

const MAX_CLOWDERS_PER_PERSON = 5;

type Preview = { name: string; member_count: number };
type SummaryRow = { clowder_id: string; invite_code: string };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand">
        <CatSprite expression="happy" size={120} />
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        {children}
      </div>
    </div>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: previewRows } = await supabase.rpc("get_clowder_preview", {
    code,
  });
  const preview = (previewRows as Preview[] | null)?.[0];

  if (!preview) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          that invite isn&apos;t valid
        </h1>
        <p className="text-sm text-muted">
          the code may be wrong, or the clowder regenerated it since this
          link was shared.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-accent transition hover:text-accent/80"
        >
          back home
        </Link>
      </Shell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const memberLabel =
    preview.member_count === 1 ? "1 member" : `${preview.member_count} members`;

  if (!user) {
    // The invite code is already sitting in a cookie (set by proxy.ts) by
    // the time this renders — signup and login both carry it through
    // automatically, no need to pass it along as a query param.
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          join {preview.name}
        </h1>
        <p className="text-sm text-muted">{memberLabel}</p>
        <div className="flex w-full flex-col gap-3 pt-2">
          <Link
            href="/signup"
            className="flex min-h-11 items-center justify-center rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98]"
          >
            sign up
          </Link>
          <Link
            href="/login"
            className="flex min-h-11 items-center justify-center rounded-xl border border-line text-ink transition hover:border-accent active:scale-[0.98]"
          >
            log in
          </Link>
        </div>
      </Shell>
    );
  }

  const { data: summaryRows } = await supabase.rpc("get_my_clowder_summary");
  const summary = (summaryRows as SummaryRow[] | null) ?? [];
  const normalizedCode = code.trim().toUpperCase();
  const alreadyMember = summary.some(
    (r) => r.invite_code === normalizedCode,
  );
  const clowderCount = new Set(summary.map((r) => r.clowder_id)).size;

  if (alreadyMember) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          you&apos;re already in {preview.name}
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-accent transition hover:text-accent/80"
        >
          go to your clowders
        </Link>
      </Shell>
    );
  }

  if (clowderCount >= MAX_CLOWDERS_PER_PERSON) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          you&apos;re in {MAX_CLOWDERS_PER_PERSON} clowders already
        </h1>
        <p className="text-sm text-muted">
          leave one to join {preview.name}.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-accent transition hover:text-accent/80"
        >
          manage your clowders
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        join {preview.name}
      </h1>
      <p className="text-sm text-muted">{memberLabel}</p>
      <div className="w-full pt-2">
        <JoinClowderButton code={code} />
      </div>
    </Shell>
  );
}
