"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MemberRing } from "@/components/MemberRing";
import { startOfLocalDay, toDateKey } from "@/lib/date";
import type { ClowderMemberSummary } from "@/lib/clowder";

export function ClowderDetail({
  clowderId,
  userId,
}: {
  clowderId: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<ClowderMemberSummary[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [openMember, setOpenMember] = useState<ClowderMemberSummary | null>(
    null,
  );
  // Nudges are global (one per person per day, not per clowder), so this is
  // a flat set of recipient ids, same as the pre-redesign ClowderPanel.
  const [nudgedToday, setNudgedToday] = useState<Set<string>>(new Set());

  const todayKey = useMemo(() => toDateKey(startOfLocalDay(new Date())), []);

  useEffect(() => {
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
        setLoadError("couldn't load this clowder.");
        setLoading(false);
        return;
      }

      const mine = ((summaryRes.data as ClowderMemberSummary[]) ?? []).filter(
        (m) => m.clowder_id === clowderId,
      );
      setMembers(mine);
      setNudgedToday(
        new Set((nudgesRes.data ?? []).map((r) => r.to_user_id as string)),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, clowderId, userId, todayKey, retryToken]);

  function retry() {
    setLoading(true);
    setLoadError(null);
    setRetryToken((t) => t + 1);
  }

  async function handleLeave() {
    setPending(true);
    setActionError(null);
    // Selects back what it deleted rather than trusting a null error alone
    // — RLS DELETE needs SELECT-level visibility on a row to act on it, and
    // this exact shape silently deleted nothing for a long time before that
    // policy existed. Kept as defense-in-depth.
    const { data, error } = await supabase
      .from("clowder_members")
      .delete()
      .eq("clowder_id", clowderId)
      .select("id");
    setPending(false);
    if (error || !data || data.length === 0) {
      setActionError("couldn't leave — try again.");
      return;
    }
    router.push("/clowders");
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

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // code is still visible on screen to copy by hand.
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-8">
        <div className="h-8 w-40 animate-pulse rounded bg-line" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-11 w-11 animate-pulse rounded-full bg-line" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-line" />
              <div className="h-2 w-12 animate-pulse rounded bg-line" />
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

  if (members.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted">
          you&apos;re not a member of this clowder.
        </p>
        <Link
          href="/clowders"
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98]"
        >
          back to clowders
        </Link>
      </div>
    );
  }

  const clowderName = members[0].clowder_name;
  const inviteCode = members[0].invite_code;
  const iAmLeader = members.some((m) => m.is_you && m.is_leader);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-8 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/clowders"
            aria-label="back"
            className="text-lg text-muted transition hover:text-ink"
          >
            ←
          </Link>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {clowderName}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          {iAmLeader && (
            <Link
              href={`/clowders/${clowderId}/settings`}
              className="text-xs font-medium text-muted transition hover:text-ink"
            >
              settings
            </Link>
          )}
          {confirmingLeave ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleLeave}
                className="text-xs font-medium text-red-500/80 transition hover:text-red-500 disabled:opacity-60"
              >
                confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                className="text-xs font-medium text-muted transition hover:text-ink"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              className="text-xs font-medium text-muted transition hover:text-ink"
            >
              leave
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-xs text-red-500/80">{actionError}</p>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {members.map((m) => (
          <button
            key={m.user_id}
            type="button"
            onClick={() => setOpenMember(m)}
            className="flex flex-col items-center gap-1.5 pt-3 text-center transition active:scale-95"
          >
            <MemberRing
              expression={m.expression}
              rate={m.trailing_rate}
              isLeader={m.is_leader}
            />
            <p className="w-full truncate text-xs font-medium text-ink">
              {m.cat_name}
            </p>
            <p className="w-full truncate text-[11px] text-muted">
              {m.username}
            </p>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted">
        invite code:{" "}
        <span className="font-mono tracking-[0.1em] text-ink">
          {inviteCode}
        </span>{" "}
        <button
          type="button"
          onClick={() => handleCopy(inviteCode)}
          className="font-medium text-accent transition hover:text-accent/80"
        >
          {copied ? "copied" : "copy"}
        </button>
      </p>

      {openMember && (
        <MemberSheet
          member={openMember}
          nudged={nudgedToday.has(openMember.user_id)}
          onNudge={() => handleNudge(openMember.user_id)}
          onClose={() => setOpenMember(null)}
        />
      )}
    </div>
  );
}

function MemberSheet({
  member,
  nudged,
  onNudge,
  onClose,
}: {
  member: ClowderMemberSummary;
  nudged: boolean;
  onNudge: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[360px] flex-col items-center gap-4 rounded-t-3xl bg-card p-6 pb-8 sm:rounded-3xl"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <MemberRing
          expression={member.expression}
          rate={member.trailing_rate}
          isLeader={member.is_leader}
          size={72}
        />
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-base font-medium text-ink">{member.cat_name}</p>
          <p className="text-sm text-muted">{member.username}</p>
        </div>

        {!member.is_you && (
          <button
            type="button"
            disabled={nudged}
            onClick={onNudge}
            className="min-h-11 w-full rounded-xl bg-ink text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
          >
            {nudged ? "nudged" : "nudge"}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted transition hover:text-ink"
        >
          close
        </button>
      </div>
    </div>
  );
}
