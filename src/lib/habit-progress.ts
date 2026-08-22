// The same per-habit rate that drives the cat's mood on Home — reused as-is
// for the calendar rings, so the rings explain her state rather than
// introducing separate math. Trailing 7-day window ending "today", weekly
// habits capped at a full ring so overachieving one week doesn't spill over.
export function trailingWeekRate(
  doneInTrailing7: number,
  habit: { target_type: "daily" | "weekly"; target_count: number },
): number {
  return habit.target_type === "weekly"
    ? Math.min(1, doneInTrailing7 / habit.target_count)
    : doneInTrailing7 / 7;
}
