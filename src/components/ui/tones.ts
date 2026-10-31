import type { OptionColor } from "@/lib/lookup-lists";

/**
 * Option colours as classes (migration 020, globals.css --tone-*). Written out
 * in full so Tailwind sees every class; components never build tone class
 * names from strings.
 *   badge — a pill: soft fill, ink text and border
 *   fill  — a datasheet cell or row: soft fill, ink text
 *   swatch — the colour chip in the list editor
 *   line  — a border in the colour's ink (a requirement box's type)
 *   bar   — the left border only (a box's status bar)
 */
export const TONES: Record<
  OptionColor,
  { badge: string; fill: string; swatch: string; line: string; bar: string }
> = {
  red: {
    badge: "bg-tone-red-soft border-tone-red-ink text-tone-red-ink",
    fill: "bg-tone-red-soft text-tone-red-ink",
    swatch: "bg-tone-red-soft border-tone-red-ink",
    line: "border-tone-red-ink",
    bar: "border-l-tone-red-ink",
  },
  orange: {
    badge: "bg-tone-orange-soft border-tone-orange-ink text-tone-orange-ink",
    fill: "bg-tone-orange-soft text-tone-orange-ink",
    swatch: "bg-tone-orange-soft border-tone-orange-ink",
    line: "border-tone-orange-ink",
    bar: "border-l-tone-orange-ink",
  },
  yellow: {
    badge: "bg-tone-yellow-soft border-tone-yellow-ink text-tone-yellow-ink",
    fill: "bg-tone-yellow-soft text-tone-yellow-ink",
    swatch: "bg-tone-yellow-soft border-tone-yellow-ink",
    line: "border-tone-yellow-ink",
    bar: "border-l-tone-yellow-ink",
  },
  green: {
    badge: "bg-tone-green-soft border-tone-green-ink text-tone-green-ink",
    fill: "bg-tone-green-soft text-tone-green-ink",
    swatch: "bg-tone-green-soft border-tone-green-ink",
    line: "border-tone-green-ink",
    bar: "border-l-tone-green-ink",
  },
  blue: {
    badge: "bg-tone-blue-soft border-tone-blue-ink text-tone-blue-ink",
    fill: "bg-tone-blue-soft text-tone-blue-ink",
    swatch: "bg-tone-blue-soft border-tone-blue-ink",
    line: "border-tone-blue-ink",
    bar: "border-l-tone-blue-ink",
  },
  purple: {
    badge: "bg-tone-purple-soft border-tone-purple-ink text-tone-purple-ink",
    fill: "bg-tone-purple-soft text-tone-purple-ink",
    swatch: "bg-tone-purple-soft border-tone-purple-ink",
    line: "border-tone-purple-ink",
    bar: "border-l-tone-purple-ink",
  },
  gray: {
    badge: "bg-tone-gray-soft border-tone-gray-ink text-tone-gray-ink",
    fill: "bg-tone-gray-soft text-tone-gray-ink",
    swatch: "bg-tone-gray-soft border-tone-gray-ink",
    line: "border-tone-gray-ink",
    bar: "border-l-tone-gray-ink",
  },
};

/** Plan-view outline levels (globals.css --level-*): level 1, level 2, then 3 and deeper. */
export const LEVEL_TONES = [
  "bg-level-1 border-level-1 text-level-ink",
  "bg-level-2 border-level-2 text-level-ink",
  "bg-level-3 border-level-3-line text-level-ink",
] as const;

/** The border and fill of a level's line colour: the outline of a Gantt card, its progress fill. */
export const LEVEL_LINES = [
  { border: "border-level-1", fill: "bg-level-1" },
  { border: "border-level-2", fill: "bg-level-2" },
  { border: "border-level-3-line", fill: "bg-level-3-line" },
] as const;

const TONE_FILLS: Record<OptionColor, string> = {
  red: "bg-tone-red-ink",
  orange: "bg-tone-orange-ink",
  yellow: "bg-tone-yellow-ink",
  green: "bg-tone-green-ink",
  blue: "bg-tone-blue-ink",
  purple: "bg-tone-purple-ink",
  gray: "bg-tone-gray-ink",
};

/** An item's outline colour on a white card: its own colour when it has one, else its level's line. */
export function planLine(
  level: number,
  color?: OptionColor | null,
): { border: string; fill: string } {
  if (color) return { border: TONES[color].line, fill: TONE_FILLS[color] };
  return LEVEL_LINES[Math.min(Math.max(Math.trunc(level), 1), LEVEL_LINES.length) - 1];
}

/** An item's box colour: its own colour when it has one, else its level's. */
export function planTone(level: number, color?: OptionColor | null): string {
  if (color) return TONES[color].badge;
  const index = Math.min(Math.max(Math.trunc(level), 1), LEVEL_TONES.length) - 1;
  return LEVEL_TONES[index];
}
