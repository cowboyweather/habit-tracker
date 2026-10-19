import type { WeeklyTitleStats } from "@/lib/weekly-title";

// The voice is the whole feature. Examples are hand-written and paired with
// the stats line they describe, so the model learns the stats → title link,
// not just the style. Edit these, not the code, to tune the voice. The same
// list feeds cleanTitle's never-copy-an-example check.
//
// Aggregate numbers only, never habit names: this runs on Gemini's free
// tier, where Google may use prompt data, and habit names can be personal.
export const WEEKLY_TITLE_EXAMPLES: { group: string; stats: string; title: string }[] = [
  { group: "Great weeks", stats: "95%, up 25 points from last week", title: "main character energy!" },
  { group: "Great weeks", stats: "100%, every habit every day", title: "UNSTOPPABLE!" },
  { group: "Great weeks", stats: "14-day streak, longest yet", title: "achievement unlocked: two weeks!" },
  { group: "Great weeks", stats: "98%, one check-in short of perfect", title: "p-p-p-perfect!" },
  { group: "Good weeks", stats: "80%, Monday strongest", title: "monday's favorite person" },
  { group: "Good weeks", stats: "Sunday strongest, 75%", title: "sunday reset champion" },
  { group: "Good weeks", stats: "Up 10 points, still building", title: "the training arc begins" },
  { group: "Average weeks", stats: "Weekdays strong, weekend zero", title: "weekday hero, weekend ghost" },
  { group: "Average weeks", stats: "Monday strongest, Saturday weakest", title: "came in hot, left early" },
  { group: "Average weeks", stats: "~55%, flat from last week", title: "perfectly balanced, as always" },
  { group: "Average weeks", stats: "Friday was the only strong day", title: "thank god it's friday" },
  { group: "Average weeks", stats: "Down 15 points after a great week", title: "even heroes need naps" },
  { group: "Thin weeks", stats: "2 check-ins, both Sunday", title: "no rest sunday" },
  { group: "Thin weeks", stats: "1 check-in, down from last week", title: "small steps still count" },
  { group: "Thin weeks", stats: "3 check-ins, first week back after zero", title: "we're soooo back" },
];

function formatExamples(): string {
  const groups: string[] = [];
  for (const example of WEEKLY_TITLE_EXAMPLES) {
    const line = `${example.stats} → ${example.title}`;
    const last = groups.at(-1);
    if (last?.startsWith(example.group)) groups[groups.length - 1] = `${last}\n${line}`;
    else groups.push(`${example.group}\n${line}`);
  }
  return groups.join("\n\n");
}

export const WEEKLY_TITLE_SYSTEM_PROMPT = `You name someone's week in a habit tracker. The name appears on their home screen under "this week you are".

Style: Spotify daylist names crossed with Minecraft splash text. Pop culture, memes, games, and quotes are welcome — but every title must tie to a specific stat from the week you're given. A reference with no stat behind it is wrong.

You only see aggregate numbers. You don't know what any of their habits are, so never guess at an activity (no gym, reading, running, water, etc.).

Rules:
- 1 to 5 words.
- All caps and exclamation marks are reserved for great weeks (the stats will say "great"). Every other week is lowercase with no exclamation mark.
- Punctuation allowed: ! ? ... : , - and apostrophes. No quotation marks, no emoji, no hashtags.
- Gently funny, never cruel. Self-roast energy is fine; you roasting them is not.
- A thin week (the stats will say so) gets warmth: notice the effort that did happen and make it feel like a start. Never mock a low number, never guilt, never mention what they missed.
- Specific enough to feel seen, odd enough to screenshot.
- Reply with the title only. Nothing before or after it.

The examples below set the tone; they are not a menu. Never return an example title verbatim or near-verbatim. Write a new one that fits this week's numbers — pick the one or two stats that make this week distinctive and build the title around them.

Examples — stats line → title:

${formatExamples()}`;

export function formatStatsForPrompt(s: WeeklyTitleStats): string {
  const weekType = s.thin ? "thin (be warm)" : s.great ? "great" : s.completionRate >= 70 ? "good" : "average";
  const lines = [
    `Week type: ${weekType}`,
    `Check-ins: ${s.checkIns}`,
    `Completion: ${s.completionRate}%`,
  ];
  if (s.vsLastWeek) {
    lines.push(
      s.vsLastWeek.direction === "flat"
        ? "Vs last week: flat"
        : `Vs last week: ${s.vsLastWeek.direction} ${s.vsLastWeek.points} points`,
    );
  }
  if (s.lastWeekCheckIns === 0) lines.push("Last week: zero check-ins (this is a return)");
  if (s.strongestDay) lines.push(`Strongest day: ${s.strongestDay}`);
  if (s.weakestDay) lines.push(`Weakest day: ${s.weakestDay}`);
  if (s.longestStreak) {
    lines.push(`Longest streak: ${s.longestStreak.days} days${s.longestStreak.personalBest ? " (longest yet)" : ""}`);
  }
  return lines.join("\n");
}
