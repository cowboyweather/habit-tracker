"use client";

import { useEffect, useRef, useState } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { CalendarPanel } from "@/components/CalendarPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ClowderPanel } from "@/components/ClowderPanel";
import { consumeLandOnClowderPanel } from "@/lib/clowder-landing";

// Layout is Clowder - Home - Calendar - Insights, left to right.
export function SwipeShell({
  userId,
  createdAt,
}: {
  userId: string;
  createdAt: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  // Read exactly once, on mount — see clowder-landing.ts for why this is a
  // cookie rather than a query param.
  const [activeIndex, setActiveIndex] = useState(() =>
    consumeLandOnClowderPanel() ? 0 : 1,
  );
  // A panel can have its own full-screen sheet (e.g. Home's breed picker).
  // While one's open, the swipe container itself needs to stop scrolling —
  // a fixed-position backdrop sits visually on top, but it's still a DOM
  // descendant of this scrollable div, so a swipe starting on it would
  // otherwise still resolve to scrolling this container underneath.
  const [scrollLocked, setScrollLocked] = useState(false);
  // The mount-scroll effect below needs activeIndex's *initial* value only
  // — captured once here so the effect can stay []-deps and not re-fire
  // (fighting the user's own swipes) every time activeIndex later changes
  // from actual scrolling.
  const landedOnClowder = useRef(activeIndex === 0);

  // Home is where the app opens by default. Clowder (index 0) is the
  // container's natural resting scroll position — it's the first child —
  // so landing there needs no explicit scroll; only the Home case (the
  // default) does.
  useEffect(() => {
    if (landedOnClowder.current) return;
    if (containerRef.current && homeRef.current) {
      containerRef.current.scrollLeft = homeRef.current.offsetLeft;
    }
  }, []);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.max(0, Math.min(3, index)));
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-y-hidden overscroll-x-contain ${
          scrollLocked ? "overflow-x-hidden" : "overflow-x-auto"
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <ClowderPanel isActive={activeIndex === 0} />
        </div>
        <div
          ref={homeRef}
          className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto"
        >
          <HomeDashboard
            userId={userId}
            createdAt={createdAt}
            isActive={activeIndex === 1}
            onSheetOpenChange={setScrollLocked}
          />
        </div>
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <CalendarPanel
            userId={userId}
            createdAt={createdAt}
            isActive={activeIndex === 2}
          />
        </div>
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <InsightsPanel
            userId={userId}
            createdAt={createdAt}
            isActive={activeIndex === 3}
          />
        </div>
      </div>

      {!scrollLocked && (
        <div
          className="pointer-events-none fixed left-1/2 z-40 flex -translate-x-1/2 gap-1.5"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                activeIndex === i ? "w-5 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
