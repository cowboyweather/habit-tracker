"use client";

import { useEffect, useState } from "react";

const SIZE = 56;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_RINGS = 5;

type RingHabit = {
  id: string;
  name: string;
  color: string;
  rate: number;
};

export function HabitRings({ habits }: { habits: RingHabit[] }) {
  const [filled, setFilled] = useState(false);
  const shown = habits.slice(0, MAX_RINGS);

  // Rings start empty and fill on mount so the transition itself is the
  // "quick satisfying animation" — a rAF delay so the browser paints the
  // 0% state first, giving the stroke-dashoffset transition something to
  // animate from rather than snapping straight to the final fill.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (shown.length === 0) return null;

  const closedCount = shown.filter((h) => h.rate >= 1).length;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex justify-center gap-4">
        {shown.map((habit) => {
          const clamped = Math.min(1, Math.max(0, habit.rate));
          const closed = clamped >= 1;
          const offset = filled
            ? CIRCUMFERENCE * (1 - clamped)
            : CIRCUMFERENCE;

          return (
            <div
              key={habit.id}
              className="flex w-14 flex-col items-center gap-1.5"
            >
              <svg
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className={closed && filled ? "animate-ring-pop" : ""}
              >
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={STROKE}
                  className="stroke-line"
                />
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={habit.color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  style={{
                    transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              </svg>
              <span className="w-full truncate text-center text-xs text-muted">
                {habit.name}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        {closedCount} of {shown.length} rings closed this week.
      </p>
    </div>
  );
}
