import CatSprite from "@/components/CatSprite";
import { parseDateKey } from "@/lib/date";
import { SEASON_PALETTES, type SeasonName } from "@/lib/season-palette";
import { pickSeasonRecapTitle, type SeasonRecapStats } from "@/lib/season-recap";

// Title text lives in lib/season-recap.ts so page.tsx can persist the exact
// string shown here. Treated as content, not interface chrome, so unlike
// the rest of the app's lowercase restyle it keeps natural sentence case.
const CLOSING_LINE = {
  normal: "however it went, you showed up. see you next season.",
  thin: "seasons ebb and flow. see you next season.",
};

function formatShortDate(dateKey: string): string {
  return parseDateKey(dateKey)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}

export function SeasonRecap({
  season,
  paletteName,
  stats,
  isPreview,
  dismissAction,
}: {
  season: { name: string; start_date: string; end_date: string };
  paletteName: SeasonName;
  stats: SeasonRecapStats;
  isPreview: boolean;
  dismissAction: (formData: FormData) => Promise<void>;
}) {
  const palette = SEASON_PALETTES[paletteName];
  const titleText = pickSeasonRecapTitle(stats.isThin);
  const closingLine = stats.isThin ? CLOSING_LINE.thin : CLOSING_LINE.normal;

  // Locally overrides the season CSS custom properties so this page renders
  // the outgoing season's palette even after data-season on <html> has
  // already flipped to the new one — Tailwind's bg-*/text-*/etc utilities
  // used inside this subtree all read these same variables.
  const paletteStyle = {
    backgroundColor: palette.background,
    color: palette.ink,
    "--color-background": palette.background,
    "--color-card": palette.card,
    "--color-ink": palette.ink,
    "--color-muted": palette.muted,
    "--color-line": palette.line,
    "--color-accent": palette.accent,
    "--color-sand": palette.sand,
    "--color-sky": palette.sky,
  } as React.CSSProperties;

  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16 text-center"
      style={paletteStyle}
    >
      {isPreview && (
        <p className="fixed left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
          preview — not recorded
        </p>
      )}

      <div
        className="animate-recap-fade-up flex flex-col items-center gap-1.5"
        style={{ animationDelay: "0ms" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {season.name.toLowerCase()}
        </p>
        <p className="text-xs text-muted">
          {formatShortDate(season.start_date)} – {formatShortDate(season.end_date)}
        </p>
      </div>

      <h1
        className="animate-recap-fade-up max-w-[320px] text-3xl font-semibold tracking-[-0.02em]"
        style={{ animationDelay: "250ms" }}
      >
        {titleText}
      </h1>

      <div
        className="animate-recap-fade-up flex min-h-[192px] items-center justify-center"
        style={{ animationDelay: "500ms" }}
      >
        <CatSprite expression="excited" size={180} />
      </div>

      <div
        className="animate-recap-fade-up grid w-full max-w-[320px] grid-cols-2 gap-x-6 gap-y-6"
        style={{ animationDelay: "750ms" }}
      >
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-[-0.02em]">
            {stats.totalCheckIns}
          </p>
          <p className="text-xs text-muted">check-ins</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-[-0.02em]">
            {Math.round(stats.completionRate * 100)}%
          </p>
          <p className="text-xs text-muted">completion rate</p>
        </div>
        <div className="flex flex-col gap-1">
          {stats.bestStreak ? (
            <>
              <p className="text-2xl font-semibold tracking-[-0.02em]">
                {stats.bestStreak.count}
                {stats.bestStreak.unit === "day" ? "d" : "w"}
              </p>
              <p className="text-xs text-muted">
                best streak — {stats.bestStreak.habitName}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-[-0.02em] text-muted">
                —
              </p>
              <p className="text-xs text-muted">still finding your rhythm</p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {stats.strongestWeekday ? (
            <>
              <p className="text-2xl font-semibold tracking-[-0.02em]">
                {stats.strongestWeekday}
              </p>
              <p className="text-xs text-muted">strongest day</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-[-0.02em] text-muted">
                —
              </p>
              <p className="text-xs text-muted">no clear pattern yet</p>
            </>
          )}
        </div>
      </div>

      <div
        className="animate-recap-fade-up flex w-full max-w-[320px] flex-col items-center gap-5"
        style={{ animationDelay: "1000ms" }}
      >
        <p className="text-sm text-muted">{closingLine}</p>
        <form action={dismissAction} className="w-full">
          <button
            type="submit"
            className="min-h-11 w-full rounded-xl text-white transition active:scale-[0.98]"
            style={{ backgroundColor: palette.ink }}
          >
            continue
          </button>
        </form>
      </div>
    </div>
  );
}
