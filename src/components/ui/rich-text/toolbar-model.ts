/**
 * Pure toolbar logic for the rich-text editor (ADR-0025), kept free of DOM
 * and Tiptap types so the node test environment covers it.
 */

/** System fonts only: the app loads no font files (STANDARDS §9, offline desktop). */
export const FONT_FAMILIES = [
  "Arial",
  "Calibri",
  "Cambria",
  "Times New Roman",
  "Courier New",
  "Segoe UI",
] as const;

/** Word's font-size list, in points. */
export const FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72] as const;

/**
 * The first family of a CSS font-family value, unquoted: what the font select
 * shows. Browsers quote names with spaces when they read styles back.
 */
export function primaryFontFamily(value: string | null | undefined): string {
  const first = (value ?? "").split(",")[0]?.trim() ?? "";
  return first.replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * Options for a select: the standard list, plus the current value when it is
 * not in it (legacy Access fonts, pasted sizes), so the select never lies.
 */
export function withCurrentOption(options: readonly string[], current: string): string[] {
  return current === "" || options.includes(current) ? [...options] : [...options, current];
}

export type ToolbarKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * ARIA toolbar keyboard model: one tab stop; Left/Right move with wrap-around,
 * Home/End jump to the ends. Returns null for keys the toolbar ignores.
 */
export function rovingIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key as ToolbarKey) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
