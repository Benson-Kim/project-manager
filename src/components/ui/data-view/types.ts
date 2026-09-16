import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";

/**
 * DataView contract (ADR-0006). A module supplies rows for ONE server-paged
 * page, the total count, a card renderer, table columns with priorities, and
 * stable ids. Everything else (toggle, URL state, selection, keyboard nav,
 * states) is shared behaviour.
 */
export interface DataViewColumn<Row> {
  key: string;
  header: string;
  /** 1 = always visible; 2 = >= sm; 3 = >= lg (column-priority hiding). */
  priority: 1 | 2 | 3;
  render: (row: Row) => React.ReactNode;
}

export interface DataViewProps<Row> {
  /** Module key — persists the view preference (usp_ViewPreference_Set). */
  moduleKey: string;
  rows: Row[];
  totalCount: number;
  page: number;
  pageSize?: number;
  /** Initial view mode resolved server-side (preference proc / cookie). */
  initialView: ViewMode;
  getRowId: (row: Row) => string | number;
  /**
   * Human-meaningful name for a row (issue #25) — selection checkboxes get
   * `messages.list.selectRow(label)` as their accessible name. Falls back to
   * the row id when absent.
   */
  getRowLabel?: (row: Row) => string;
  renderCard: (row: Row) => React.ReactNode;
  columns: DataViewColumn<Row>[];
  /** Open the record (Sheet or route per the module's decided pattern). */
  onOpen?: (row: Row) => void;
  /** Enables selection + the bulk bar when provided. */
  bulkActions?: (selectedIds: Array<string | number>, clear: () => void) => React.ReactNode;
  /** Rendered when there is no data at all (no search/filter active). */
  empty: React.ReactNode;
}

/**
 * Accessible name for a row-selection checkbox (issue #25): meaningful when
 * the module supplies getRowLabel, null otherwise (call sites keep their
 * previous fallback).
 */
export function rowSelectionLabel<Row>(
  row: Row,
  getRowLabel?: (row: Row) => string,
): string | null {
  return getRowLabel ? messages.list.selectRow(getRowLabel(row)) : null;
}

export const priorityClass: Record<1 | 2 | 3, string> = {
  1: "",
  2: "hidden sm:table-cell",
  3: "hidden lg:table-cell",
};
