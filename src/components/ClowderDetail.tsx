"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MemberRing } from "@/components/MemberRing";
import { startOfLocalDay, toDateKey } from "@/lib/date";
import type { ClowderMemberSummary } from "@/lib/clowder";

// Ring size, tripled from the original 44px per the sizing pass — reads
// clearly at a glance in a 2-up grid on a phone.
const GRID_RING_SIZE = 132;
const SHEET_RING_SIZE = 100;
// 44px is the minimum comfortable touch target — every icon button here
// uses this footprint even where the icon drawn inside it is smaller.
const TOUCH_TARGET = "flex h-11 w-11 shrink-0 items-center justify-center";

function SettingsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
        <line x1="4.9" y1="4.9" x2="7" y2="7" />
        <line x1="17" y1="17" x2="19.1" y2="19.1" />
        <line x1="4.9" y1="19.1" x2="7" y2="17" />
        <line x1="17" y1="7" x2="19.1" y2="4.9" />
      </g>
    </svg>
  );
}

function LeaveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 8l4 4-4 4M20 12H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
    router.push("/");
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
          href="/"
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/"
            aria-label="back"
            className={`${TOUCH_TARGET} text-xl text-muted transition hover:text-ink`}
          >
            ←
          </Link>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink">
              {clowderName}
            </h1>
            <div className="flex items-center gap-0.5">
              <span className="font-mono text-xs tracking-[0.1em] text-muted">
                {inviteCode}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(inviteCode)}
                aria-label="copy invite code"
                className={`${TOUCH_TARGET} text-muted transition hover:text-ink`}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {iAmLeader && (
            <Link
              href={`/clowders/${clowderId}/settings`}
              aria-label="settings"
              className={`${TOUCH_TARGET} rounded-full text-muted transition hover:bg-line/60 hover:text-ink`}
            >
              <SettingsIcon />
            </Link>
          )}
          {confirmingLeave ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={handleLeave}
                aria-label="confirm leave"
                className={`${TOUCH_TARGET} rounded-full text-red-500 transition hover:bg-red-500/10 disabled:opacity-60`}
              >
                <LeaveIcon />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                aria-label="cancel"
                className={`${TOUCH_TARGET} rounded-full text-lg text-muted transition hover:bg-line/60 hover:text-ink`}
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              aria-label="leave clowder"
              className={`${TOUCH_TARGET} rounded-full text-red-500/70 transition hover:bg-red-500/10 hover:text-red-500`}
            >
              <LeaveIcon />
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-xs text-red-500/80">{actionError}</p>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {members.map((m) => (
          <button
            key={m.user_id}
            type="button"
            onClick={() => setOpenMember(m)}
            className="flex flex-col items-center gap-2 text-center transition active:scale-95"
          >
            <MemberRing
              expression={m.expression}
              rate={m.trailing_rate}
              size={GRID_RING_SIZE}
            />
            <p className="w-full truncate text-sm font-medium text-ink">
              {m.cat_name}
            </p>
            <p className="w-full truncate text-xs text-muted">
              {m.username}
            </p>
          </button>
        ))}
      </div>

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
          size={SHEET_RING_SIZE}
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
