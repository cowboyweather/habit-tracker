"use client";

import { useEffect, useRef, useState } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { CalendarPanel } from "@/components/CalendarPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ClowderPanel } from "@/components/ClowderPanel";

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
  const [activeIndex, setActiveIndex] = useState(1);

  // Home must always be where the app opens, regardless of prior scroll
  // position. Direct scrollLeft assignment is instant (no animation), so
  // there's nothing to visibly reset — it's just already there.
  useEffect(() => {
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
        className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <ClowderPanel />
        </div>
        <div
          ref={homeRef}
          className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto"
        >
          <HomeDashboard
            userId={userId}
            createdAt={createdAt}
            isActive={activeIndex === 1}
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
    </div>
  );
}
