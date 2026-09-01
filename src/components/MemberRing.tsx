import CatSprite, { type Breed, type Expression } from "@/components/CatSprite";

const STROKE_RATIO = 0.045;

// Wraps a progress ring around a clowder member's cat, rather than sitting
// beside it — the pet is the indicator. A filled checkmark badge marks a
// genuinely closed ring — at small sizes 95% and 100% read almost
// identically as a bare arc, so the badge (not just the arc closing) is
// what actually signals "done."
export function MemberRing({
  breed,
  expression,
  rate,
  size = 44,
}: {
  breed: Breed;
  expression: Expression;
  rate: number;
  size?: number;
}) {
  const clamped = Math.min(1, Math.max(0, rate));
  const closed = clamped >= 1;
  const stroke = Math.max(2, Math.round(size * STROKE_RATIO));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const catSize = Math.round(size * 0.6);
  const badgeSize = Math.max(14, Math.round(size * 0.22));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="flex h-full w-full items-center justify-center">
        <CatSprite breed={breed} expression={expression} size={catSize} />
      </div>
      {closed && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-accent leading-none text-white"
          style={{
            width: badgeSize,
            height: badgeSize,
            bottom: -badgeSize * 0.15,
            right: -badgeSize * 0.15,
            fontSize: badgeSize * 0.6,
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}
