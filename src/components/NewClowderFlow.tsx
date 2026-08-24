"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";

export function NewClowderFlow() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_clowder", {
      clowder_name: name,
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/clowders/${data}`);
  }

  async function handleJoin() {
    const code = joinCode.trim();
    if (!code) return;
    setPending(true);
    setError(null);
    const { data, error } = await supabase.rpc("join_clowder_by_invite_code", {
      code,
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/clowders/${data}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-4 pt-8 pb-24">
      <div className="flex items-center gap-1">
        <Link
          href="/"
          aria-label="back"
          className="flex h-11 w-11 items-center justify-center text-xl text-muted transition hover:text-ink"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          add a clowder
        </h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {error && <p className="text-xs text-red-500/80">{error}</p>}

        {mode === "none" && (
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="min-h-11 flex-1 rounded-xl bg-ink text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
            >
              create a new one
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className="min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-ink transition hover:border-accent active:scale-[0.98]"
            >
              join with a code
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="flex w-full flex-col gap-3">
            <label className={LABEL_CLASS} htmlFor="clowder-name">
              create a clowder
            </label>
            <input
              id="clowder-name"
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. sunday crew"
              className={FIELD_CLASS}
            />
            <button
              type="button"
              disabled={pending || !createName.trim()}
              onClick={handleCreate}
              className="min-h-11 rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
            >
              create
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="flex w-full flex-col gap-3">
            <label className={LABEL_CLASS} htmlFor="join-code">
              join with a code
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="invite code"
              className={`${FIELD_CLASS} font-mono uppercase tracking-[0.1em]`}
            />
            <button
              type="button"
              disabled={pending || !joinCode.trim()}
              onClick={handleJoin}
              className="min-h-11 rounded-xl border border-line text-ink transition hover:border-accent active:scale-[0.98] disabled:opacity-60"
            >
              join
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
