"use server";

import { createClient } from "@/lib/supabase/server";
import { HABIT_COLORS } from "@/lib/habit-colors";
import type { Breed } from "@/components/CatSprite";

export async function saveCatName(name: string, breed: Breed) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated. please log in again.");

  const petName = name.trim();
  if (!petName) throw new Error("enter a name for your cat.");

  const { error } = await supabase
    .from("pets")
    .insert({ user_id: user.id, name: petName, breed });

  if (error) throw new Error(error.message);
}

export async function saveHabits(names: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated. please log in again.");

  const cleaned = names.map((n) => n.trim()).filter(Boolean).slice(0, 5);
  if (cleaned.length === 0) throw new Error("add at least one habit.");

  const rows = cleaned.map((name, i) => ({
    user_id: user.id,
    name,
    color: HABIT_COLORS[i % HABIT_COLORS.length],
    position: i,
  }));

  const { error } = await supabase.from("habits").insert(rows);
  if (error) throw new Error(error.message);
}
