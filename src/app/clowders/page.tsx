import { redirect } from "next/navigation";

// No standalone list page — this content already lives at "/" as
// SwipeShell's first panel (Clowder is its natural resting scroll
// position). Rendering it again here, bare, with no swipe container, was
// a dead end: any link back to "/clowders" (from the detail page, the
// new-clowder flow, or after leaving) dropped you on a page with no
// Home/Calendar/Insights panels mounted at all, so swiping did nothing —
// not a scroll-state bug, just nowhere to swipe to. This route exists
// only so an old bookmark or typed URL still goes somewhere.
export default function ClowdersPage() {
  redirect("/");
}
