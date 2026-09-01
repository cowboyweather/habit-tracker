"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BreedPicker } from "@/components/BreedPicker";
import { LABEL_CLASS } from "@/lib/form-styles";
import type { Breed } from "@/components/CatSprite";

export function PetSettings({
  userId,
  initialBreed,
}: {
  userId: string;
  initialBreed: Breed;
}) {
  const supabase = createClient();
  const [breed, setBreed] = useState<Breed>(initialBreed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from("pets")
      .update({ breed })
      .eq("user_id", userId);
    setPending(false);
    if (error) {
      setError("couldn't save — try again.");
      return;
    }
    setSaved(true);
  }

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-8 px-4"
      style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-1">
        <Link
          href="/"
          aria-label="back"
          className="flex h-11 w-11 items-center justify-center text-xl text-muted transition hover:text-ink"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          settings
        </h1>
      </div>

      {error && <p className="text-xs text-red-500/80">{error}</p>}

      <div className="flex flex-col gap-3">
        <label className={LABEL_CLASS}>Coat</label>
        <BreedPicker
          value={breed}
          onChange={(b) => {
            setBreed(b);
            setSaved(false);
          }}
        />
        <button
          type="button"
          disabled={pending || breed === initialBreed}
          onClick={handleSave}
          className="min-h-11 rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
        >
          {saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}
