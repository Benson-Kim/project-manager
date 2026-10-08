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
  /**
   * When provided, this column participates in the inline add-row guide.
   * Receives the current draft string value, an onChange handler, and an
   * onKeyDown handler (used to commit on Enter). Columns without renderInput
   * show an empty cell in the guide row.
   *
   * Keep the control lightweight — no Field wrapper, no label. The cell itself
   * is the spatial affordance.
   */
  renderInput?: (props: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    /**
     * Live option list for this column, resolved from DropdownListConfigContext
     * by DataView when the column carries a `dropdownKey`. Empty array otherwise.
     * Use this to populate a `<select>` so changes made in the config modal are
     * reflected immediately without reloading the page.
     */
    options: string[];
  }) => React.ReactNode;
  /** Ghost placeholder text shown in the input when empty. */
  addRowPlaceholder?: string;
  /**
   * Initial pixel width for the column in table/list view.
   * The user can override by dragging the resize handle in the header.
   * Omit to let the column size naturally.
   */
  width?: number;
  /**
   * When true the cell renders as an inline input instead of the read-only
   * render output. The column must also supply `renderEdit` and the DataView
   * `onCellChange` handler must be wired up.
   */
  editable?: boolean;
  /**
   * Render an editable input for this cell. Receives the current row and a
   * change callback that the caller should use to mutate their local state or
   * fire a server action.
   *
   * Keep the control lightweight (no Field wrapper, no label): the cell itself
   * is the spatial affordance.
   */
  renderEdit?: (
    row: Row,
    onChange: (value: string) => void,
    /**
     * Live option list for this column, resolved from DropdownListConfigContext
     * by DataView when the column carries a `dropdownKey`. Empty array otherwise.
     * Use this to populate a `<select>` so edits always reflect the latest
     * options without reloading the page.
     */
    options: string[],
  ) => React.ReactNode;
  /**
   * Opaque key that links this column to a managed dropdown option list.
   * When set, the table header renders a caret (▾) button that opens the
   * global DropdownListConfigModal so users can add, rename, reorder, or
   * delete options without touching individual pages.
   * The key must match an entry in the DropdownListConfigProvider `defaults`
   * map supplied by the module's view component.
   */
  dropdownKey?: string;
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
   * Row height (px) for data rows in table view. Controls the min-height of
   * every `<tr>`. Defaults to 40 px (the original `min-h-11` value).
   * A value between 32–80 covers compact → spacious presets; drag-resize is
   * not exposed at the row level (column widths have resize handles).
   */
  rowHeight?: number;
  /**
   * Called when an editable cell value changes.
   * Receives the row id, column key, and new raw string value.
   * The caller is responsible for debouncing / persisting.
   */
  onCellChange?: (rowId: string | number, columnKey: string, value: string) => void;
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
   * When provided, renders a persistent "Add new entry" guide row pinned to the
   * bottom of the table body. The callback receives the current draft state
   * (keyed by column key) and must return an ActionResult-style promise.
   * The row resets automatically on success; errors surface via the toast system.
   */
  addRow?: {
    /** Called when the user commits the row (✓ button or Enter key). */
    onAdd: (draft: Record<string, string>) => Promise<{ ok: boolean; error?: { message: string } }>;
    /** Label for the accessible row / submit button. */
    addLabel?: string;
  };
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
