// A short-lived, client-only cookie (distinct from the httpOnly invite-code
// cookie in invite-cookie.ts) that tells SwipeShell where to land on the
// very next page load. Set immediately before a client-side router.push to
// "/", read once on mount, then cleared.
//
// Deliberately a cookie, not a query param. Reading "?joinedClowder=1"
// needs to be correct at the exact moment the new page's component tree
// first renders (a lazy useState initializer) — and confirmed empirically,
// both window.location.search and next/navigation's useSearchParams can
// still reflect the PREVIOUS url at that instant for a client-side
// navigation, not the pushed one. document.cookie doesn't have that race:
// it's set before router.push is even called, and cookies aren't tied to
// a specific navigation's URL-update timing at all.
const LANDING_COOKIE = "swipe_landing";

export function markLandOnClowder() {
  document.cookie = `${LANDING_COOKIE}=clowder; path=/; max-age=15; samesite=lax`;
}

export function markInviteFailed(reason: string) {
  document.cookie = `${LANDING_COOKIE}=failed:${encodeURIComponent(reason)}; path=/; max-age=15; samesite=lax`;
}

export function consumeSwipeLanding(): {
  landOnClowder: boolean;
  failedReason: string | null;
} {
  if (typeof document === "undefined") {
    return { landOnClowder: false, failedReason: null };
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LANDING_COOKIE}=([^;]*)`),
  );
  if (!match) return { landOnClowder: false, failedReason: null };

  document.cookie = `${LANDING_COOKIE}=; path=/; max-age=0`;

  const value = decodeURIComponent(match[1]);
  if (value === "clowder") return { landOnClowder: true, failedReason: null };
  if (value.startsWith("failed:")) {
    return { landOnClowder: false, failedReason: value.slice(7) };
  }
  return { landOnClowder: false, failedReason: null };
}
