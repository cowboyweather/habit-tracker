"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startOfLocalDay, toDateKey } from "@/lib/date";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";
import CatSprite from "@/components/CatSprite";
import type { ClowderMemberSummary } from "@/lib/clowder";

const MICRO_SPRITE_SIZE = 32;

type ClowderGroup = {
  clowder_id: string;
  clowder_name: string;
  invite_code: string;
  members: ClowderMemberSummary[];
};

// get_my_clowder_summary() returns one flat row per (clowder, member) pair
// across every clowder the caller belongs to — this groups it back into
// sections for rendering. Map preserves insertion order, and the query is
// already ordered by clowder creation, so groups come out in that order
// with no extra sort needed.
function groupByClowder(members: ClowderMemberSummary[]): ClowderGroup[] {
  const map = new Map<string, ClowderGroup>();
  for (const m of members) {
    let group = map.get(m.clowder_id);
    if (!group) {
      group = {
        clowder_id: m.clowder_id,
        clowder_name: m.clowder_name,
        invite_code: m.invite_code,
        members: [],
      };
      map.set(m.clowder_id, group);
    }
    group.members.push(m);
  }
  return Array.from(map.values());
}

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
  // Nudges are global (one per person per day, not per clowder), so this is
  // a flat set of recipient ids regardless of which clowder section they
  // appear in — the same person showing up in two of your clowders still
  // shares one nudge state.
  const [nudgedToday, setNudgedToday] = useState<Set<string>>(new Set());
  const [retryToken, setRetryToken] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copiedClowderId, setCopiedClowderId] = useState<string | null>(null);

  const todayKey = useMemo(() => toDateKey(startOfLocalDay(new Date())), []);

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
        setLoadError("couldn't load your clowders.");
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

  async function handleLeave(clowderId: string) {
    setPending(true);
    setActionError(null);
    // Scoped to this one clowder — user_id alone is no longer unique to a
    // single membership row now that someone can be in several.
    const { error } = await supabase
      .from("clowder_members")
      .delete()
      .eq("user_id", userId)
      .eq("clowder_id", clowderId);
    setPending(false);
    if (error) {
      setActionError("couldn't leave — try again.");
      return;
    }
    refresh();
  }

  async function handleRegenerate(clowderId: string) {
    setPending(true);
    setActionError(null);
    const { error } = await supabase.rpc("regenerate_clowder_invite_code", {
      target_clowder_id: clowderId,
    });
    setPending(false);
    if (error) {
      setActionError("couldn't regenerate the code — try again.");
      return;
    }
    refresh();
  }

  async function handleCopy(clowderId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedClowderId(clowderId);
      setTimeout(() => setCopiedClowderId(null), 1500);
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

  const groups = groupByClowder(members);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 pt-8 pb-24">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
        clowder
      </h1>

      {groups.length === 0 && (
        <p className="text-sm text-muted">
          join a clowder with friends and motivate each other! friends cannot
          see what your habit goals are, but they can follow your progress.
        </p>
      )}

      {actionError && <p className="text-xs text-red-500/80">{actionError}</p>}

      {groups.map((group) => {
        const you = group.members.find((m) => m.is_you);
        const others = group.members.filter((m) => !m.is_you);

        return (
          <div key={group.clowder_id} className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
              {group.clowder_name}
            </h2>

            <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-4">
              <div className="flex flex-col gap-1">
                <p className={LABEL_CLASS}>invite code</p>
                <p className="font-mono text-lg tracking-[0.15em] text-ink">
                  {group.invite_code}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(group.clowder_id, group.invite_code)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent"
                >
                  {copiedClowderId === group.clowder_id ? "copied" : "copy"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleRegenerate(group.clowder_id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-ink disabled:opacity-60"
                >
                  regenerate
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {you && <MemberRow member={you} nudged={false} onNudge={undefined} />}
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
              onClick={() => handleLeave(group.clowder_id)}
              className="self-start text-xs font-medium text-muted transition hover:text-ink disabled:opacity-60"
            >
              leave clowder
            </button>
          </div>
        );
      })}

      <div
        className={`flex flex-col gap-8 ${groups.length > 0 ? "border-t border-line pt-8" : ""}`}
      >
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
