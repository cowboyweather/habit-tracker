"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markLandOnClowder } from "@/lib/swipe-landing";

export function JoinClowderButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("join_clowder_by_invite_code", {
      code,
    });
    if (error) {
      setPending(false);
      setError(error.message);
      return;
    }
    markLandOnClowder();
    router.push("/");
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {error && <p className="text-center text-xs text-red-500/80">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={handleJoin}
        className="min-h-11 w-full rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
      >
        join
      </button>
    </div>
  );
}
