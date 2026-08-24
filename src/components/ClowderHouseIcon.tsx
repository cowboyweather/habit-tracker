// Shared placeholder for every clowder — distinct per-clowder icons are a
// later roadmap item. Simple blocky shapes in the app's existing tokens
// rather than an emoji, so it doesn't clash with the pixel-art cat sprite
// stylistically, without requiring real pixel art of its own yet.
export function ClowderHouseIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
      role="img"
      aria-label="clowder"
    >
      <rect x="5" y="1" width="6" height="2" fill="var(--color-ink)" />
      <rect x="3" y="3" width="10" height="2" fill="var(--color-ink)" />
      <rect x="1" y="5" width="14" height="2" fill="var(--color-ink)" />
      <rect x="2" y="7" width="12" height="8" fill="var(--color-sand)" />
      <rect x="2" y="7" width="12" height="1" fill="var(--color-ink)" />
      <rect x="7" y="10" width="2" height="5" fill="var(--color-accent)" />
    </svg>
  );
}
