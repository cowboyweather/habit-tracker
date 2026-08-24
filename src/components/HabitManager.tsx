"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FIELD_CLASS } from "@/lib/form-styles";
import { HABIT_COLORS } from "@/lib/habit-colors";

type Habit = {
  id: string;
  name: string;
  color: string;
  position: number;
  archived: boolean;
  target_type: "daily" | "weekly";
  target_count: number;
};

export function HabitManager({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("habits")
        .select(
          "id, name, color, position, archived, target_type, target_count",
        )
        .eq("user_id", userId)
        .order("position", { ascending: true });

      if (cancelled) return;

      if (error) {
        setError("couldn't load your habits.");
      } else {
        setHabits((data as Habit[]) ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const active = useMemo(
    () =>
      habits.filter((h) => !h.archived).sort((a, b) => a.position - b.position),
    [habits],
  );
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);

  async function addHabit() {
    const name = newName.trim();
    if (!name) return;

    setAdding(true);
    setError(null);
    const color = HABIT_COLORS[active.length % HABIT_COLORS.length];

    const { data, error } = await supabase
      .from("habits")
      .insert({
        user_id: userId,
        name,
        color,
        position: active.length,
        archived: false,
      })
      .select("id, name, color, position, archived, target_type, target_count")
      .single();

    setAdding(false);

    if (error || !data) {
      setError("couldn't add that habit.");
      return;
    }

    setHabits((prev) => [...prev, data as Habit]);
    setNewName("");
  }

  async function renameHabit(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const prevHabits = habits;
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, name: trimmed } : h)),
    );

    const { data, error } = await supabase
      .from("habits")
      .update({ name: trimmed })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setHabits(prevHabits);
      setError("couldn't rename that habit.");
    }
  }

  async function recolorHabit(id: string, color: string) {
    const prevHabits = habits;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, color } : h)));

    const { data, error } = await supabase
      .from("habits")
      .update({ color })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setHabits(prevHabits);
      setError("couldn't change that color.");
    }
  }

  async function updateTargetType(id: string, targetType: "daily" | "weekly") {
    const prevHabits = habits;
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, target_type: targetType } : h)),
    );

    const { data, error } = await supabase
      .from("habits")
      .update({ target_type: targetType })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setHabits(prevHabits);
      setError("couldn't change that habit's type.");
    }
  }

  async function updateTargetCount(id: string, rawValue: string) {
    const parsed = Math.min(7, Math.max(1, Number(rawValue) || 1));

    const prevHabits = habits;
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, target_count: parsed } : h)),
    );

    const { data, error } = await supabase
      .from("habits")
      .update({ target_count: parsed })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setHabits(prevHabits);
      setError("couldn't update that target.");
    }
  }

  async function moveHabit(id: string, direction: -1 | 1) {
    const index = active.findIndex((h) => h.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= active.length) return;

    const reordered = [...active];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];
    const renumbered = reordered.map((h, idx) => ({ ...h, position: idx }));

    const prevHabits = habits;
    setHabits([...renumbered, ...archived]);

    const results = await Promise.all(
      renumbered.map((h) =>
        supabase
          .from("habits")
          .update({ position: h.position })
          .eq("id", h.id)
          .select("id"),
      ),
    );

    if (results.some((r) => r.error || !r.data || r.data.length === 0)) {
      setHabits(prevHabits);
      setError("couldn't reorder — try again.");
    }
  }

  async function archiveHabit(id: string) {
    const thisHabit = habits.find((h) => h.id === id);
    if (!thisHabit) return;

    const remainingActive = active
      .filter((h) => h.id !== id)
      .map((h, idx) => ({ ...h, position: idx }));

    const prevHabits = habits;
    setHabits([
      ...remainingActive,
      { ...thisHabit, archived: true },
      ...archived,
    ]);

    const results = await Promise.all([
      supabase
        .from("habits")
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq("id", id)
        .select("id"),
      ...remainingActive.map((h) =>
        supabase
          .from("habits")
          .update({ position: h.position })
          .eq("id", h.id)
          .select("id"),
      ),
    ]);

    if (results.some((r) => r.error || !r.data || r.data.length === 0)) {
      setHabits(prevHabits);
      setError("couldn't archive that habit.");
    }
  }

  async function unarchiveHabit(id: string) {
    const thisHabit = habits.find((h) => h.id === id);
    if (!thisHabit) return;

    const newPosition = active.length;
    const prevHabits = habits;
    setHabits([
      ...active,
      { ...thisHabit, archived: false, position: newPosition },
      ...archived.filter((h) => h.id !== id),
    ]);

    const { data, error } = await supabase
      .from("habits")
      .update({ archived: false, archived_at: null, position: newPosition })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setHabits(prevHabits);
      setError("couldn't unarchive that habit.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] items-center justify-center px-4">
        <p className="text-sm text-muted">loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-8">
      <Link
        href="/"
        className="text-sm font-medium text-accent transition hover:text-accent/80"
      >
        ← home
      </Link>

      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
        manage habits
      </h1>

      {error && <p className="text-xs text-red-500/80">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="new habit"
          className={FIELD_CLASS}
        />
        <button
          type="button"
          disabled={adding || !newName.trim()}
          onClick={addHabit}
          className="min-h-11 shrink-0 rounded-xl bg-ink px-4 text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50"
        >
          add
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {active.length === 0 && (
          <p className="text-sm text-muted">
            no active habits — add one above.
          </p>
        )}

        {active.map((habit, idx) => (
          <div
            key={habit.id}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveHabit(habit.id, -1)}
                  aria-label="move up"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted transition hover:bg-line/60 hover:text-ink disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={idx === active.length - 1}
                  onClick={() => moveHabit(habit.id, 1)}
                  aria-label="move down"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted transition hover:bg-line/60 hover:text-ink disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <input
                type="text"
                defaultValue={habit.name}
                onBlur={(e) => renameHabit(habit.id, e.target.value)}
                className="min-h-11 flex-1 rounded-[10px] border border-line bg-card px-3 py-2 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />

              <button
                type="button"
                onClick={() => archiveHabit(habit.id)}
                className="shrink-0 text-xs font-medium text-muted transition hover:text-ink"
              >
                archive
              </button>
            </div>

            <div className="flex gap-2 pl-8">
              {HABIT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => recolorHabit(habit.id, color)}
                  aria-label={`set color ${color}`}
                  className={`h-6 w-6 rounded-full transition active:scale-90 ${
                    habit.color === color
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-card"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 pl-8">
              <button
                type="button"
                onClick={() => updateTargetType(habit.id, "daily")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  habit.target_type === "daily"
                    ? "bg-ink text-white"
                    : "border border-line text-muted hover:text-ink"
                }`}
              >
                daily
              </button>
              <button
                type="button"
                onClick={() => updateTargetType(habit.id, "weekly")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  habit.target_type === "weekly"
                    ? "bg-ink text-white"
                    : "border border-line text-muted hover:text-ink"
                }`}
              >
                weekly
              </button>
              {habit.target_type === "weekly" && (
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    key={`target-count-${habit.id}-${habit.target_count}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={7}
                    defaultValue={habit.target_count}
                    onBlur={(e) => updateTargetCount(habit.id, e.target.value)}
                    className="h-7 w-12 rounded border border-line bg-card px-1 text-center text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  × / week
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Archived
          </p>
          {archived.map((habit) => (
            <div
              key={habit.id}
              className="flex items-center justify-between rounded-2xl border border-line bg-card p-4"
            >
              <p className="text-muted">{habit.name}</p>
              <button
                type="button"
                onClick={() => unarchiveHabit(habit.id)}
                className="text-xs font-medium text-accent transition hover:text-accent/80"
              >
                unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
