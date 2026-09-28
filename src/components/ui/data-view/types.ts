import type { ViewMode } from "@/lib/list-params";

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
   * Renders the toolbar (search, filters, view toggle). Receives the view-
   * toggle button node so it can be embedded inside the module toolbar layout.
   * When omitted, the default toggle strip is rendered inline.
   */
  renderToolbar?: (viewToggle: React.ReactNode) => React.ReactNode;
  /** Rendered when there is no data at all (no search/filter active). */
  empty: React.ReactNode;
}

export const priorityClass: Record<1 | 2 | 3, string> = {
  1: "",
  2: "hidden sm:table-cell",
  3: "hidden lg:table-cell",
};
