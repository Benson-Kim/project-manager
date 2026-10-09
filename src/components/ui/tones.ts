import type { OptionColor } from "@/lib/lookup-lists";

/**
 * Option colours as classes (migration 020, globals.css --tone-*). Written out
 * in full so Tailwind sees every class; components never build tone class
 * names from strings.
 *   badge — a pill: soft fill, ink text and border
 *   fill  — a datasheet cell or row: soft fill, ink text
 *   swatch — the colour chip in the list editor
 */
export const TONES: Record<OptionColor, { badge: string; fill: string; swatch: string }> = {
  red: {
    badge: "bg-tone-red-soft border-tone-red-ink text-tone-red-ink",
    fill: "bg-tone-red-soft text-tone-red-ink",
    swatch: "bg-tone-red-soft border-tone-red-ink",
  },
  orange: {
    badge: "bg-tone-orange-soft border-tone-orange-ink text-tone-orange-ink",
    fill: "bg-tone-orange-soft text-tone-orange-ink",
    swatch: "bg-tone-orange-soft border-tone-orange-ink",
  },
  yellow: {
    badge: "bg-tone-yellow-soft border-tone-yellow-ink text-tone-yellow-ink",
    fill: "bg-tone-yellow-soft text-tone-yellow-ink",
    swatch: "bg-tone-yellow-soft border-tone-yellow-ink",
  },
  green: {
    badge: "bg-tone-green-soft border-tone-green-ink text-tone-green-ink",
    fill: "bg-tone-green-soft text-tone-green-ink",
    swatch: "bg-tone-green-soft border-tone-green-ink",
  },
  blue: {
    badge: "bg-tone-blue-soft border-tone-blue-ink text-tone-blue-ink",
    fill: "bg-tone-blue-soft text-tone-blue-ink",
    swatch: "bg-tone-blue-soft border-tone-blue-ink",
  },
  purple: {
    badge: "bg-tone-purple-soft border-tone-purple-ink text-tone-purple-ink",
    fill: "bg-tone-purple-soft text-tone-purple-ink",
    swatch: "bg-tone-purple-soft border-tone-purple-ink",
  },
  gray: {
    badge: "bg-tone-gray-soft border-tone-gray-ink text-tone-gray-ink",
    fill: "bg-tone-gray-soft text-tone-gray-ink",
    swatch: "bg-tone-gray-soft border-tone-gray-ink",
  },
};
