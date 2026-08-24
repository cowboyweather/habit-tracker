"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";
import { ClowderHouseIcon } from "@/components/ClowderHouseIcon";
import type { ClowderMemberSummary } from "@/lib/clowder";

type ClowderSummary = {
  clowder_id: string;
  clowder_name: string;
};

// get_my_clowder_summary() returns one flat row per (clowder, member) pair
// across every clowder the caller belongs to — the main list only needs
// one entry per clowder. Map preserves insertion order, and the query is
// already ordered by clowder creation, so entries come out in that order
// with no extra sort needed.
function dedupeClowders(members: ClowderMemberSummary[]): ClowderSummary[] {
  const map = new Map<string, ClowderSummary>();
  for (const m of members) {
    if (!map.has(m.clowder_id)) {
      map.set(m.clowder_id, {
        clowder_id: m.clowder_id,
        clowder_name: m.clowder_name,
      });
    }
  }
  return Array.from(map.values());
}

// This is the main clowders list — used both as SwipeShell's first swipe
// panel (isActive gates the fetch until it's scrolled into view) and
// directly at /clowders (always active, no gating needed there).
export function ClowderPanel({ isActive = true }: { isActive?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clowders, setClowders] = useState<ClowderSummary[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  // Governs which form is open in the empty state, where "create" and
  // "join" start as two bare buttons and only one form shows at a time.
  const [formMode, setFormMode] = useState<"none" | "create" | "join">(
    "none",
  );

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.rpc("get_my_clowder_summary");

      if (cancelled) return;

      if (error) {
        setLoadError("couldn't load your clowders.");
        setLoading(false);
        return;
      }

      setClowders(dedupeClowders((data as ClowderMemberSummary[]) ?? []));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, isActive, retryToken]);

  function retry() {
    setLoading(true);
    setLoadError(null);
    setRetryToken((t) => t + 1);
  }

  function refresh() {
    setRetryToken((t) => t + 1);
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    setPending(true);
    setActionError(null);
    const { error } = await supabase.rpc("create_clowder", {
      clowder_name: name,
    });
    setPending(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setCreateName("");
    setFormMode("none");
    refresh();
  }

  async function handleJoin() {
    const code = joinCode.trim();
    if (!code) return;
    setPending(true);
    setActionError(null);
    const { error } = await supabase.rpc("join_clowder_by_invite_code", {
      code,
    });
    setPending(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setJoinCode("");
    setFormMode("none");
    refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8">
        <div className="h-8 w-28 animate-pulse rounded bg-line" />
        <div className="grid grid-cols-3 gap-x-3 gap-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-24 w-24 animate-pulse rounded-xl bg-line" />
              <div className="h-2.5 w-14 animate-pulse rounded bg-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted">{loadError}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
        >
          try again
        </button>
      </div>
    );
  }

  function createForm(onCancel: () => void) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS} htmlFor="clowder-name">
            create a clowder
          </label>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-muted transition hover:text-ink"
          >
            cancel
          </button>
        </div>
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
    );
  }

  function joinForm(onCancel: () => void) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS} htmlFor="join-code">
            join with a code
          </label>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-muted transition hover:text-ink"
          >
            cancel
          </button>
        </div>
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
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 pt-8 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
          clowders
        </h1>
        {clowders.length > 0 && (
          <Link
            href="/clowders/new"
            aria-label="add a clowder"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl text-ink transition hover:border-accent active:scale-[0.98]"
          >
            +
          </Link>
        )}
      </div>

      {actionError && <p className="text-xs text-red-500/80">{actionError}</p>}

      {clowders.length === 0 ? (
        <>
          {formMode === "none" && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <p className="text-sm text-muted">
                join a clowder with friends and motivate each other! friends
                cannot see what your habit goals are, but they can follow
                your progress.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormMode("create")}
                  className="min-h-11 rounded-xl bg-ink px-6 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
                >
                  create
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode("join")}
                  className="min-h-11 rounded-xl border border-line px-6 text-sm font-medium text-ink transition hover:border-accent active:scale-[0.98]"
                >
                  join
                </button>
              </div>
            </div>
          )}
          {formMode === "create" && createForm(() => setFormMode("none"))}
          {formMode === "join" && joinForm(() => setFormMode("none"))}
        </>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6">
          {clowders.map((c) => (
            <Link
              key={c.clowder_id}
              href={`/clowders/${c.clowder_id}`}
              className="flex flex-col items-center gap-2 text-center transition active:scale-95"
            >
              <ClowderHouseIcon size={96} />
              <span className="w-full truncate text-xs font-medium text-ink">
                {c.clowder_name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
