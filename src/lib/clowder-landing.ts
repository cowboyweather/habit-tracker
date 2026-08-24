// A short-lived, client-only cookie that tells SwipeShell to land on the
// Clowder panel (instead of its normal default, Home) the next time "/"
// loads. Set right before navigating there from anywhere that
// conceptually means "back to the clowders list" — the clowder detail
// page's back arrow, its not-a-member fallback, after leaving a clowder,
// and the new-clowder flow's back arrow.
//
// A cookie, not a query param: reading "?xyz=1" needs to be correct at
// the exact moment the new page's component tree first renders (a lazy
// useState initializer), and window.location.search / next/navigation's
// useSearchParams can both still reflect the PREVIOUS url at that instant
// for a client-side navigation — confirmed empirically while building the
// original version of this mechanism. document.cookie doesn't have that
// race: it's set before router navigation even starts.
const LANDING_COOKIE = "land_on_clowder_panel";

export function markLandOnClowderPanel() {
  document.cookie = `${LANDING_COOKIE}=1; path=/; max-age=15; samesite=lax`;
}

export function consumeLandOnClowderPanel(): boolean {
  if (typeof document === "undefined") return false;
  const has = document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${LANDING_COOKIE}=`));
  if (has) {
    document.cookie = `${LANDING_COOKIE}=; path=/; max-age=0`;
  }
  return has;
}
