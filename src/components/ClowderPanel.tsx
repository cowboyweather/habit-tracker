"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startOfLocalDay, toDateKey } from "@/lib/date";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";
import CatSprite from "@/components/CatSprite";
import type { ClowderMemberSummary } from "@/lib/clowder";

const MICRO_SPRITE_SIZE = 32;

export function ClowderPanel({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<ClowderMemberSummary[]>([]);
  const [nudgedToday, setNudgedToday] = useState<Set<string>>(new Set());
  const [retryToken, setRetryToken] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copyLabel, setCopyLabel] = useState("copy");

  const todayKey = useMemo(() => toDateKey(startOfLocalDay(new Date())), []);

  // Refetches every time this panel actually becomes visible, matching
  // Calendar/Insights/Home — a nudge sent or a clowder joined elsewhere
  // shouldn't go stale until a manual reload.
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    async function load() {
      const [summaryRes, nudgesRes] = await Promise.all([
        supabase.rpc("get_my_clowder_summary"),
        supabase
          .from("clowder_nudges")
          .select("to_user_id")
          .eq("from_user_id", userId)
          .eq("nudge_date", todayKey),
      ]);

      if (cancelled) return;

      if (summaryRes.error) {
        setLoadError("couldn't load your clowder.");
        setLoading(false);
        return;
      }

      setMembers((summaryRes.data as ClowderMemberSummary[]) ?? []);
      setNudgedToday(
        new Set((nudgesRes.data ?? []).map((r) => r.to_user_id as string)),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, todayKey, isActive, retryToken]);

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
    refresh();
  }

  async function handleLeave() {
    setPending(true);
    setActionError(null);
    const { error } = await supabase
      .from("clowder_members")
      .delete()
      .eq("user_id", userId);
    setPending(false);
    if (error) {
      setActionError("couldn't leave — try again.");
      return;
    }
    refresh();
  }

  async function handleRegenerate() {
    setPending(true);
    setActionError(null);
    const { error } = await supabase.rpc("regenerate_clowder_invite_code");
    setPending(false);
    if (error) {
      setActionError("couldn't regenerate the code — try again.");
      return;
    }
    refresh();
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopyLabel("copied");
      setTimeout(() => setCopyLabel("copy"), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // code is still visible on screen to copy by hand, so this is a
      // quiet no-op rather than a surfaced error.
    }
  }

  async function handleNudge(toUserId: string) {
    setActionError(null);
    setNudgedToday((prev) => new Set(prev).add(toUserId)); // optimistic
    const { error } = await supabase.from("clowder_nudges").insert({
      from_user_id: userId,
      to_user_id: toUserId,
      nudge_date: todayKey,
    });
    if (error) {
      setNudgedToday((prev) => {
        const next = new Set(prev);
        next.delete(toUserId);
        return next;
      });
      setActionError("couldn't send that nudge.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8">
        <div className="h-8 w-28 animate-pulse rounded bg-line" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4"
          >
            <div className="h-8 w-8 animate-pulse rounded-full bg-line" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-line" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
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

  if (members.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 pt-8 pb-24">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
          clowder
        </h1>
        <p className="text-sm text-muted">
          a small group of friends, cooperative rather than competitive. no
          leaderboard, no ranking.
        </p>

        {actionError && (
          <p className="text-xs text-red-500/80">{actionError}</p>
        )}

        <div className="flex flex-col gap-3">
          <label className={LABEL_CLASS} htmlFor="clowder-name">
            start one
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
            create a clowder
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className={LABEL_CLASS} htmlFor="join-code">
            or join one
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
            join with code
          </button>
        </div>
      </div>
    );
  }

  const you = members.find((m) => m.is_you);
  const others = members.filter((m) => !m.is_you);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8 pb-24">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
        {members[0].clowder_name}
      </h1>

      {actionError && <p className="text-xs text-red-500/80">{actionError}</p>}

      <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASS}>invite code</p>
          <p className="font-mono text-lg tracking-[0.15em] text-ink">
            {members[0].invite_code}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleCopy(members[0].invite_code)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleRegenerate}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-ink disabled:opacity-60"
          >
            regenerate
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {you && (
          <MemberRow member={you} nudged={false} onNudge={undefined} />
        )}
        {others.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            nudged={nudgedToday.has(m.user_id)}
            onNudge={() => handleNudge(m.user_id)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={handleLeave}
        className="self-start text-xs font-medium text-muted transition hover:text-ink disabled:opacity-60"
      >
        leave clowder
      </button>
    </div>
  );
}

function MemberRow({
  member,
  nudged,
  onNudge,
}: {
  member: ClowderMemberSummary;
  nudged: boolean;
  onNudge: (() => void) | undefined;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
      <CatSprite expression={member.expression} size={MICRO_SPRITE_SIZE} />
      <div className="flex flex-1 flex-col">
        <p className="text-sm font-medium text-ink">
          {member.username}
          {member.is_you && <span className="text-muted"> · you</span>}
        </p>
        <p className="text-xs text-muted">
          {member.cat_name} · {member.current_streak} day streak
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span
          className={`text-[11px] ${member.logged_today ? "text-accent" : "text-muted"}`}
        >
          {member.logged_today ? "logged today" : "not yet"}
        </span>
        {onNudge && (
          <button
            type="button"
            disabled={nudged}
            onClick={onNudge}
            className="text-xs font-medium text-accent transition hover:text-accent/80 disabled:text-muted disabled:no-underline"
          >
            {nudged ? "nudged" : "nudge"}
          </button>
        )}
      </div>
    </div>
  );
}
