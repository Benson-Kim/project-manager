import { z } from "zod";

/**
 * Datasheet layout (ADR-0023): how a user arranged a list module's table —
 * column order (drag a header, or "Arrange columns"), column widths (drag a
 * header's right edge) and the row height (drag a row's bottom edge; every row
 * follows, as in Access). Kept per user per module next to the view mode
 * (usp_ViewPreference_*, migration 019). Pure helpers so Vitest covers them.
 */

export const COLUMN_WIDTH_MIN = 80;
export const COLUMN_WIDTH_MAX = 800;
export const ROW_HEIGHT_MIN = 40;
export const ROW_HEIGHT_MAX = 240;
/** Keyboard step of a resize handle (arrow keys). */
export const RESIZE_STEP = 16;

const columnKey = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/);

export const listLayoutSchema = z.object({
  /** Column keys (DataViewColumn.key) in display order. */
  order: z.array(columnKey).max(40).optional(),
  /** Column widths in pixels, by column key. */
  widths: z
    .record(columnKey, z.number().int().min(COLUMN_WIDTH_MIN).max(COLUMN_WIDTH_MAX))
    .optional(),
  /** Every row's height in pixels. */
  rowHeight: z.number().int().min(ROW_HEIGHT_MIN).max(ROW_HEIGHT_MAX).optional(),
});

export type ListLayout = z.infer<typeof listLayoutSchema>;

/**
 * The columns in the layout's order. Keys the module no longer has are ignored;
 * columns missing from the order (new ones, or a column only one page shows,
 * like the cross-project Project column) keep their default place: right after
 * the column that precedes them by default.
 */
export function orderColumns<T extends { key: string }>(
  columns: readonly T[],
  order: readonly string[] | null | undefined,
): T[] {
  if (!order?.length) return [...columns];
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const result = [...new Set(order)].flatMap((key) => {
    const column = byKey.get(key);
    return column ? [column] : [];
  });
  columns.forEach((column, index) => {
    if (result.includes(column)) return;
    const previous = index === 0 ? -1 : result.indexOf(columns[index - 1]!);
    result.splice(previous + 1, 0, column);
  });
  return result;
}

/** Moves the key at `from` to index `to` (both within range). */
export function moveKey(keys: readonly string[], from: number, to: number): string[] {
  const next = [...keys];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export const clampWidth = (px: number) =>
  Math.round(Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, px)));

export const clampRowHeight = (px: number) =>
  Math.round(Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT_MIN, px)));

/**
 * What to store: the layout without members that equal the default (an order
 * that is the module's own, no widths), or null when nothing is left.
 */
export function normalizeLayout(
  defaultKeys: readonly string[],
  layout: ListLayout | null,
): ListLayout | null {
  if (!layout) return null;
  const result: ListLayout = {};
  const order = layout.order;
  if (
    order &&
    !(order.length === defaultKeys.length && order.every((key, i) => key === defaultKeys[i]))
  ) {
    result.order = [...order];
  }
  if (layout.widths && Object.keys(layout.widths).length > 0) result.widths = { ...layout.widths };
  if (layout.rowHeight !== undefined) result.rowHeight = layout.rowHeight;
  return Object.keys(result).length > 0 ? result : null;
}

/** A stored Layout value (JSON text from the proc); null when absent or invalid. */
export function parseListLayout(json: string | null | undefined): ListLayout | null {
  if (!json) return null;
  try {
    const parsed = listLayoutSchema.safeParse(JSON.parse(json));
    return parsed.success && Object.keys(parsed.data).length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}
