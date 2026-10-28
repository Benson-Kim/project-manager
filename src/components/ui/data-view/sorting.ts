import { nextSortDir, type ListSort, type SortDir } from "@/lib/list-params";
import type { DataViewColumn } from "./types";

/**
 * What a column header shows about the order (client feedback, 2026-10-23): the
 * list procs have taken `@SortBy`/`@SortDir` since ADR-0016, so this derives the
 * header's state from the URL and nothing more. Pure, so the arrow's state and
 * the next click are tested without a DOM.
 */

/**
 * The `@SortBy` token a column asks the proc for. It is the column's own key
 * unless the two were named differently — a layout key is stored per user
 * (migration 019), so it cannot be renamed to match a proc column.
 */
export function sortTokenOf<Row>(column: DataViewColumn<Row>): string {
  return column.sort ?? column.key;
}

export interface HeaderSort {
  /** How this column is ordered now; null when the list is ordered by another. */
  active: SortDir | null;
  /** The direction a click asks for. */
  next: SortDir;
}

/**
 * A column's sort state, or null when it is not sortable — the module's
 * `ListSort` is the proc's whitelist, so a column it does not name gets no
 * control rather than one that would do nothing.
 */
export function headerSort<Row>(
  column: DataViewColumn<Row>,
  sort: ListSort | undefined,
  current: { sort?: string; dir: SortDir },
): HeaderSort | null {
  if (!sort) return null;
  const token = sortTokenOf(column);
  if (!sort.columns.includes(token)) return null;
  return {
    active: current.sort === token ? current.dir : null,
    next: nextSortDir(token, current),
  };
}

/** `aria-sort` for the header cell (WAI-ARIA table pattern). */
export function ariaSort(
  state: HeaderSort | null,
): "ascending" | "descending" | "none" | undefined {
  if (!state) return undefined;
  if (state.active === "asc") return "ascending";
  if (state.active === "desc") return "descending";
  return "none";
}
