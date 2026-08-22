"use client";

import { useEffect, useRef, useState } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ClanPanel } from "@/components/ClanPanel";

// Layout is Insights - Home - Clan, left to right. Swiping left moves the
// viewport toward later (rightward) content, same physics as flipping to
// the next iOS home screen page — so "swipe left -> Clan" means Clan has
// to sit to the right of Home, and "swipe right -> Insights" means
// Insights sits to the left.
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
    setActiveIndex(Math.max(0, Math.min(2, index)));
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <InsightsPanel />
        </div>
        <div
          ref={homeRef}
          className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto"
        >
          <HomeDashboard userId={userId} createdAt={createdAt} />
        </div>
        <div className="h-full w-screen shrink-0 snap-start snap-always overflow-y-auto">
          <ClanPanel />
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1.5">
        {[0, 1, 2].map((i) => (
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
