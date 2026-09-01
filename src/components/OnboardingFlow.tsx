"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CatSprite, { type Breed } from "@/components/CatSprite";
import { BreedPicker } from "@/components/BreedPicker";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";
import { saveCatName, saveHabits } from "@/app/onboarding/actions";

const SUGGESTIONS = ["Exercise", "Read", "Sleep by 11"];
const MAX_HABITS = 5;

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex justify-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${step === 1 ? "bg-ink" : "bg-line"}`}
      />
      <span
        className={`h-1.5 w-1.5 rounded-full ${step === 2 ? "bg-ink" : "bg-line"}`}
      />
    </div>
  );
}

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [catName, setCatName] = useState("");
  const [breed, setBreed] = useState<Breed>("munchkin");
  const [habitNames, setHabitNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCatContinue() {
    setError(null);
    const finalName = catName.trim();
    if (!finalName) {
      setError("enter a name for your cat to continue.");
      return;
    }
    startTransition(async () => {
      try {
        await saveCatName(finalName, breed);
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : "something went wrong.");
      }
    });
  }

  function updateHabit(index: number, value: string) {
    setHabitNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function addHabitRow() {
    setHabitNames((prev) =>
      prev.length < MAX_HABITS ? [...prev, ""] : prev,
    );
  }

  function applySuggestion(suggestion: string) {
    setHabitNames((prev) => {
      const emptyIndex = prev.findIndex((n) => n.trim() === "");
      if (emptyIndex !== -1) {
        return prev.map((n, i) => (i === emptyIndex ? suggestion : n));
      }
      if (prev.length < MAX_HABITS) {
        return [...prev, suggestion];
      }
      return prev;
    });
  }

  function handleHabitsContinue() {
    setError(null);
    const cleaned = habitNames.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setError("add at least one habit to continue.");
      return;
    }
    startTransition(async () => {
      try {
        await saveHabits(habitNames);
        router.push("/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "something went wrong.");
      }
    });
  }

  if (step === 1) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-10">
        <StepDots step={1} />

        <div className="flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand">
          <CatSprite breed={breed} expression="happy" size={120} />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
            meet your cat
          </h1>
          <p className="text-sm text-muted">
            she reflects how consistently you show up — keep up your habits
            and she thrives.
          </p>
        </div>

        {error && (
          <p className="text-center text-xs text-red-500/80">{error}</p>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS} htmlFor="cat-name">
              Name
            </label>
            <input
              id="cat-name"
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. munchkin"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS}>Coat</label>
            <BreedPicker value={breed} onChange={setBreed} />
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleCatContinue}
              className="min-h-11 w-full rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
            >
              continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-10">
      <StepDots step={2} />

      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
          what are you building?
        </h1>
      </div>

      {error && <p className="text-center text-xs text-red-500/80">{error}</p>}

      <div className="flex flex-col gap-3">
        {habitNames.map((value, i) => (
          <input
            key={i}
            type="text"
            value={value}
            onChange={(e) => updateHabit(i, e.target.value)}
            placeholder={`habit ${i + 1}`}
            className={FIELD_CLASS}
          />
        ))}

        {habitNames.length < MAX_HABITS && (
          <button
            type="button"
            onClick={addHabitRow}
            className="self-start text-sm font-medium text-accent transition hover:text-accent/80"
          >
            + add another
          </button>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applySuggestion(s)}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink transition hover:border-accent hover:text-accent active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={handleHabitsContinue}
          className="mt-2 min-h-11 w-full rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
        >
          continue
        </button>
      </div>
    </div>
  );
}
