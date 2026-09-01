// CatSprite.tsx
// Drop into: src/components/CatSprite.tsx
// Sprite sheets live in: public/cats/cat-<breed>.png
//
// Usage:
//   import CatSprite, { moodFromCompletion } from "@/components/CatSprite";
//   <CatSprite breed="munchkin" expression={moodFromCompletion(0.62)} size={132} />

export type Expression =
  | "content"
  | "happy"
  | "restless"
  | "scruffy"
  | "blep"
  | "sleepy"
  | "excited";

/** Frame order in every cat-<breed>.png, left to right. Don't reorder without regenerating the sheets. */
const FRAMES: Expression[] = [
  "content",
  "happy",
  "restless",
  "scruffy",
  "blep",
  "sleepy",
  "excited",
];

/** Every coat a sprite sheet exists for — must match the DB check constraint on pets.breed. */
export const BREEDS = [
  "munchkin",
  "midnight",
  "marmalade",
  "tuxedo",
  "siamese",
  "russian",
  "calico",
  "snow",
] as const;

export type Breed = (typeof BREEDS)[number];

/** Native sprite grid, before scaling. */
const FRAME_W = 22;
const FRAME_H = 18;

/**
 * Mood comes from completion rate over the trailing 7 days, not from streak.
 * One missed day shouldn't tank the cat, and a few good days should bring her back.
 */
export function moodFromCompletion(rate: number): Expression {
  if (rate >= 0.8) return "happy";
  if (rate >= 0.5) return "content";
  if (rate >= 0.25) return "restless";
  return "scruffy";
}

/**
 * Moments, as opposed to moods. Check these first — they override the mood
 * when they apply, then fall back.
 */
export function momentaryExpression(opts: {
  allHabitsDoneToday?: boolean;
  streakJustBroke?: boolean;
  hour?: number;
  /**
   * Whether this page load's blep roll landed. Callers that want the 1-in-25
   * chance to apply only once per page load (not reroll on every call, e.g.
   * every time this is recomputed after a habit toggle) should roll it once
   * themselves and pass the result here instead of leaving this undefined.
   */
  blep?: boolean;
}): Expression | null {
  if (opts.streakJustBroke) return "restless";
  if (opts.allHabitsDoneToday) return "excited";
  const h = opts.hour ?? new Date().getHours();
  if (h >= 23 || h < 5) return "sleepy";
  // rare, random delight — roughly 1 in 25 opens
  if (opts.blep ?? Math.random() < 0.04) return "blep";
  return null;
}

// Her body occupies columns 0-14 of the 22-wide frame; the tail flourish
// takes columns 15-21. The naive body-center offset (3.5 cols) overcorrects
// visually, since the eye weighs the tail's pixels too — 2 cols reads right.
const BODY_OFFSET_COLUMNS = 2;

type Props = {
  expression?: Expression;
  /** Rendered height in CSS pixels. Width follows the sprite's aspect ratio. */
  size?: number;
  className?: string;
  /** Which coat's sheet to load, from public/cats/cat-<breed>.png. */
  breed?: Breed;
  /** Shift right so the cat's body reads as centered, not the tail-inclusive frame. */
  centerBody?: boolean;
};

export default function CatSprite({
  expression = "content",
  size = 132,
  className,
  breed = "munchkin",
  centerBody = true,
}: Props) {
  const index = Math.max(0, FRAMES.indexOf(expression));
  const scale = Math.max(1, Math.round(size / FRAME_H));
  const width = FRAME_W * scale;
  const height = FRAME_H * scale;
  const bodyOffset = centerBody ? BODY_OFFSET_COLUMNS * scale : 0;
  const src = `/cats/cat-${breed}.png`;

  return (
    <div
      role="img"
      aria-label={`cat looking ${expression}`}
      className={className}
      style={{
        width,
        height,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${width * FRAMES.length}px ${height}px`,
        backgroundPosition: `-${index * width}px 0`,
        imageRendering: "pixelated",
        transform: bodyOffset ? `translateX(${bodyOffset}px)` : undefined,
      }}
    />
  );
}
