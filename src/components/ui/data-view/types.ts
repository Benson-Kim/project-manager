import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import type { OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { CellEditor, DatasheetConfig } from "./datasheet";

/**
 * DataView contract (ADR-0006, datasheet mode ADR-0023). A module supplies rows
 * for ONE server-paged page, the total count, a card renderer, table columns
 * with priorities, and stable ids. Everything else (toggle, URL state,
 * selection, keyboard nav, states, in-cell editing, the new-entry row, the
 * dropdown-list editor) is shared behaviour.
 */
export interface DataViewColumn<Row> {
  key: string;
  header: string;
  /** 1 = always visible; 2 = >= sm; 3 = >= lg (column-priority hiding). */
  priority: 1 | 2 | 3;
  render: (row: Row) => React.ReactNode;
  /** Datasheet editing for this column (list view, ADR-0023); read-only when omitted. */
  edit?: CellEditor<Row>;
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
  /**
   * The user's saved datasheet layout — column order, widths, row height
   * (usp_ViewPreference_Get, migration 019); omitted/null = the module's default.
   * List view lets the user change it.
   */
  initialLayout?: ListLayout | null;
  /**
   * A row colour of the module's own (e.g. an overdue to-do); wins over the
   * colour of its values in lists that tint rows (migration 020).
   */
  rowTone?: (row: Row) => OptionColor | null;
  getRowId: (row: Row) => string | number;
  /**
   * Optional accessible label for a row (used by bulkActions checkbox + screen
   * reader announcements). When omitted, the row id is used as fallback.
   */
  getRowLabel?: (row: Row) => string;
  renderCard: (row: Row) => React.ReactNode;
  columns: DataViewColumn<Row>[];
  /** Open the record (Sheet or route per the module's decided pattern). */
  onOpen?: (row: Row) => void;
  /** Enables selection + the bulk bar when provided. */
  bulkActions?: (selectedIds: Array<string | number>, clear: () => void) => React.ReactNode;
  /**
   * Datasheet mode (ADR-0023): editable cells for columns with `edit`, the
   * new-entry row and the list carets, in list view. Omit for a read-only list.
   */
  datasheet?: DatasheetConfig<Row>;
  /**
   * Renders the toolbar (search, filters, view toggle). Receives the view-
   * toggle button node so it can be embedded inside the module toolbar layout.
   * When omitted, the default toggle strip is rendered inline.
   */
  renderToolbar?: (viewToggle: React.ReactNode) => React.ReactNode;
  /** Rendered when there is no data at all (no search/filter active). */
  empty: React.ReactNode;
  /**
   * When true, treats the view as having an active filter even if the standard
   * `q` / `filter` URL params are absent. Use when a module has module-specific
   * filter params (e.g. `category`, `priority`) so the toolbar remains mounted
   * and the user can clear the filter when zero rows match.
   */
  filtersActive?: boolean;
}

export const priorityClass: Record<1 | 2 | 3, string> = {
  1: "",
  2: "hidden sm:table-cell",
  3: "hidden lg:table-cell",
};

/**
 * Accessible name for a row-selection checkbox: meaningful when the module
 * supplies getRowLabel, null otherwise (call sites use the row id as fallback).
 */
export function rowSelectionLabel<Row>(
  row: Row,
  getRowLabel?: (row: Row) => string,
): string | null {
  return getRowLabel ? messages.list.selectRow(getRowLabel(row)) : null;
}
