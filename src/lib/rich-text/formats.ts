/**
 * The rich-text formatting vocabulary (ADR-0041), shared by the editor (client), the sanitiser
 * (server) and the stylesheet guardrail (src/tests/rich-text-formats.test.ts). A new colour,
 * numbering style or indent level is added here and in the `.rich-text` rules of globals.css.
 *
 * Colours are stored by name (`data-color="red"`), never as CSS values: globals.css maps each
 * name to the theme's tone tokens, so coloured text stays readable in light mode, dark mode and on
 * paper, and the sanitiser checks an enum instead of parsing CSS. Colours pasted from Word or
 * found in Access HTML are mapped to the nearest name (`nearestColor`).
 */

export const TEXT_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"] as const;
export const HIGHLIGHT_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
  "gray",
] as const;
export const CELL_SHADES = ["gray", "blue", "green", "yellow", "orange", "red", "purple"] as const;

export type TextColor = (typeof TEXT_COLORS)[number];
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export type CellShade = (typeof CELL_SHADES)[number];
export type ColorName = TextColor | HighlightColor | CellShade;

export const DEFAULT_HIGHLIGHT: HighlightColor = "yellow";

/** Paragraph and heading indent: levels 1..INDENT_MAX, each INDENT_STEP_EM wide. */
export const INDENT_MAX = 8;
export const INDENT_STEP_EM = 2;
/** A pasted margin of this many points is one level (Word's default tab stop, 0.5 in). */
const INDENT_STEP_PT = 36;

/**
 * Legal (outline) numbering: a nested item reads 1.1, then 1.1.1, rather than
 * restarting at 1 (client feedback 2026-10-26, E6). It is the one style no
 * list-style-type can express, so it renders through CSS counters keyed off
 * data-numbering rather than an inline style.
 */
export const LEGAL_NUMBERING = "1.1";

/**
 * Numbering styles: the HTML `type` of an `<ol>` and the CSS list-style-type it
 * renders with. Legal numbering has no list-style-type of its own, so its css
 * is null and `.rich-text ol[data-numbering="legal"]` draws it instead.
 */
export const NUMBERING_STYLES = [
  { type: "1", css: "decimal" },
  { type: LEGAL_NUMBERING, css: null },
  { type: "a", css: "lower-alpha" },
  { type: "A", css: "upper-alpha" },
  { type: "i", css: "lower-roman" },
  { type: "I", css: "upper-roman" },
] as const;
export type NumberingType = (typeof NUMBERING_STYLES)[number]["type"];
export const LIST_START_MAX = 9999;

/** A page break is `<hr data-page-break="true">`; an `<hr>` with any other value is a line. */
export const PAGE_BREAK_VALUE = "true";

/** h1 belongs to the page, so the editor's "Heading 1..5" are h2..h6. */
export const HEADING_LEVELS = [2, 3, 4, 5, 6] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function numberingCss(type: string | null | undefined): string | null {
  return NUMBERING_STYLES.find((s) => s.type === type)?.css ?? null;
}

/** Legal numbering is carried by data-numbering, not by a list-style-type. */
export function isLegalNumbering(type: string | null | undefined): boolean {
  return type === LEGAL_NUMBERING;
}

/** An `<ol start>` value the editor keeps: an integer 1..LIST_START_MAX, else null (start at 1). */
export function listStart(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= LIST_START_MAX ? n : null;
}

/** An indent level 0..INDENT_MAX from a `data-indent` value; anything else is 0. */
export function indentLevel(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= INDENT_MAX ? n : 0;
}

const LENGTH_PT: Record<string, number> = {
  pt: 1,
  px: 0.75,
  in: 72,
  cm: 72 / 2.54,
  mm: 7.2 / 2.54,
  em: 12,
};

/** The indent level closest to a pasted CSS margin (`36pt`, `0.5in`, `48px`); 0 when unknown. */
export function indentFromCss(margin: string | null | undefined): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px|in|cm|mm|em)\s*$/i.exec(margin ?? "");
  if (!match) return 0;
  const pt = Number(match[1]) * LENGTH_PT[match[2].toLowerCase()];
  return Math.min(INDENT_MAX, Math.max(0, Math.round(pt / INDENT_STEP_PT)));
}

type Rgb = readonly [number, number, number];

/** The colour names Word and browsers paste, as RGB. */
const NAMED_RGB: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  darkred: [139, 0, 0],
  orange: [255, 165, 0],
  yellow: [255, 255, 0],
  darkyellow: [128, 128, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  green: [0, 128, 0],
  darkgreen: [0, 100, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  darkcyan: [0, 139, 139],
  teal: [0, 128, 128],
  blue: [0, 0, 255],
  darkblue: [0, 0, 139],
  navy: [0, 0, 128],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  darkmagenta: [139, 0, 139],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  darkgray: [169, 169, 169],
  lightgray: [211, 211, 211],
  silver: [192, 192, 192],
};

/** RGB of `#rgb`, `#rrggbb`, `rgb()`/`rgba()` or a named colour; null for anything else. */
export function parseCssColor(value: string | null | undefined): Rgb | null {
  const v = (value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
    v,
  );
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
    return parts.every((p) => p <= 255) ? (parts as unknown as Rgb) : null;
  }
  return NAMED_RGB[v] ?? null;
}

type Family = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "gray";

/** The hue family of a colour; null for black, white and near-black/near-white greys. */
function family([r, g, b]: Rgb): Family | null {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.15 || delta < 0.08) {
    return lightness < 0.3 || lightness > 0.85 ? null : "gray";
  }
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  let hue =
    max === rn
      ? ((gn - bn) / delta) % 6
      : max === gn
        ? (bn - rn) / delta + 2
        : (rn - gn) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 340) return "red";
  if (hue < 50) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 255) return "blue";
  if (hue < 290) return "purple";
  return "pink";
}

/** When a palette lacks a family, the next best names, in order. */
const FALLBACK: Record<Family, Family[]> = {
  red: ["pink", "orange"],
  pink: ["purple", "red"],
  orange: ["yellow", "red"],
  yellow: ["orange", "green"],
  green: ["blue", "yellow"],
  blue: ["purple", "green"],
  purple: ["pink", "blue"],
  gray: [],
};

/**
 * The palette name nearest to a CSS colour, or null when it has none (black and white mean
 * "automatic"). A palette name itself maps to itself.
 */
export function nearestColor<T extends string>(
  value: string | null | undefined,
  palette: readonly T[],
): T | null {
  if (isOneOf(palette, value)) return value;
  const rgb = parseCssColor(value);
  const f = rgb ? family(rgb) : null;
  if (!f) return null;
  for (const candidate of [f, ...FALLBACK[f]]) {
    if (isOneOf(palette, candidate)) return candidate;
  }
  return null;
}
