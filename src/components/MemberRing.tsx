import CatSprite, { type Expression } from "@/components/CatSprite";

const STROKE = 3;

// Wraps a progress ring around a clowder member's cat, rather than sitting
// beside it — the pet is the indicator. Two cues distinguish a genuinely
// closed ring from a near-full one (95% reads almost identically to 100%
// as a bare arc at this size): a filled checkmark badge only appears at
// rate >= 1, and the arc itself only ever fully closes there.
export function MemberRing({
  expression,
  rate,
  isLeader,
  size = 44,
}: {
  expression: Expression;
  rate: number;
  isLeader: boolean;
  size?: number;
}) {
  const clamped = Math.min(1, Math.max(0, rate));
  const closed = clamped >= 1;
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const catSize = Math.round(size * 0.6);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {isLeader && (
        <span
          role="img"
          aria-label="clowder leader"
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-sm leading-none"
        >
          👑
        </span>
      )}
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
          strokeWidth={STROKE}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="flex h-full w-full items-center justify-center">
        <CatSprite expression={expression} size={catSize} />
      </div>
      {closed && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] leading-none text-white">
          ✓
        </span>
      )}
    </div>
  );
}
