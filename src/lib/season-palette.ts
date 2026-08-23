export type SeasonName = "spring" | "summer" | "autumn" | "winter";

const SEASON_NAMES: SeasonName[] = ["spring", "summer", "autumn", "winter"];

// Season rows are named e.g. "Summer 2026" — this is the only place that
// parses that convention into one of the four palette keys.
export function seasonNameFromRow(name: string): SeasonName | null {
  const word = name.split(" ")[0].toLowerCase();
  return (SEASON_NAMES as string[]).includes(word) ? (word as SeasonName) : null;
}

// Mirrors the four palettes in globals.css's :root[data-season="..."]
// blocks. Duplicated here (rather than shared) because globals.css is a
// plain CSS file with no build step that could import a TS module — keep
// these in sync by hand if a palette changes there.
export const SEASON_PALETTES: Record<
  SeasonName,
  {
    background: string;
    card: string;
    ink: string;
    muted: string;
    line: string;
    accent: string;
    sand: string;
    sky: string;
  }
> = {
  spring: {
    background: "#e9f1e4",
    card: "#ffffff",
    ink: "#1e3326",
    muted: "#7a897c",
    line: "#d8e1d4",
    accent: "#5b9e6b",
    sand: "#f0e4dc",
    sky: "#dcebd5",
  },
  summer: {
    background: "#e8f1f0",
    card: "#ffffff",
    ink: "#17302e",
    muted: "#6f8b88",
    line: "#d5e3e1",
    accent: "#2e8c8c",
    sand: "#f0e5d2",
    sky: "#dceff2",
  },
  autumn: {
    background: "#f3e9dc",
    card: "#ffffff",
    ink: "#33251a",
    muted: "#8a7e72",
    line: "#e3d9cc",
    accent: "#b4652c",
    sand: "#e8d3b6",
    sky: "#ebdbc7",
  },
  winter: {
    background: "#e6eaf0",
    card: "#ffffff",
    ink: "#1a2231",
    muted: "#767c87",
    line: "#d5dae0",
    accent: "#4a5f94",
    sand: "#edf1f6",
    sky: "#d8dee9",
  },
};
