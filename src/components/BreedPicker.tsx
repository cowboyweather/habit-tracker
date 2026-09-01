"use client";

import CatSprite, { BREEDS, type Breed } from "@/components/CatSprite";

const SWATCH_SPRITE_SIZE = 40;

export function BreedPicker({
  value,
  onChange,
}: {
  value: Breed;
  onChange: (breed: Breed) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {BREEDS.map((breed) => {
        const selected = value === breed;
        return (
          <button
            key={breed}
            type="button"
            onClick={() => onChange(breed)}
            aria-label={breed}
            aria-pressed={selected}
            className={`flex min-h-11 flex-col items-center justify-center rounded-xl border p-2 transition active:scale-95 ${
              selected
                ? "border-accent bg-accent/10 ring-2 ring-accent"
                : "border-line hover:border-accent/50"
            }`}
          >
            <CatSprite breed={breed} expression="content" size={SWATCH_SPRITE_SIZE} />
          </button>
        );
      })}
    </div>
  );
}
