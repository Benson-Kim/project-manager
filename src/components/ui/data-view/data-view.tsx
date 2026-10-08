"use client";

import { useCallback, useEffect, useRef, useState, useId } from "react";
import { DEFAULT_PAGE_SIZE, totalPages, type ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../announcer";
import { EmptyState } from "../states";
import { saveViewPreference } from "./save-view-preference";
import { DropdownListConfigModal, useDropdownResolver } from "./dropdown-list-config";
import { useTableSizeConfig, TableSizeConfigButton } from "./table-size-config";
import { priorityClass, rowSelectionLabel, type DataViewProps, type DataViewColumn } from "./types";
import { useListUrlState } from "./use-list-url-state";
import { InlineAddRow } from "./inline-add-row";

/**
 * The ONE list component (ADR-0006): grid/list toggle (persisted per user per
 * module + URL-synced), server-side paging, selection + bulk bar, roving
 * keyboard navigation, empty/zero-result states. Server Components fetch the
 * page and pass rows down — this component never fetches data.
 *
 * Table enhancements (Access/Excel style):
 *  • Spacious rows: default 44 px min-height, configurable via `rowHeight` prop.
 *  • Grid borders: 1-px borders on every cell edge so the table reads as a
 *    spreadsheet grid rather than a striped list.
 *  • Column resize: drag handle on every TH right-edge. Widths are local state
 *    initialised from `col.width`; they do not persist across page loads (add a
 *    preference proc if persistence is needed).
 *  • Direct inline editing: columns with `editable: true` render `renderEdit`
 *    inside the TD. Changing the value fires `onCellChange(rowId, colKey, val)`.
 *    No modal required — the cell IS the input.
 */
export function DataView<Row>({
  moduleKey,
  rows,
  totalCount,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  initialView,
  getRowId,
  getRowLabel,
  renderCard,
  columns,
  onOpen,
  bulkActions,
  addRow,
  renderToolbar,
  empty,
  filtersActive = false,
  rowHeight,
  onCellChange,
}: DataViewProps<Row>) {
  const { searchParams, update } = useListUrlState();
  const { announce } = useAnnouncer();
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Dropdown config modal state — only one column open at a time.
  const [configModal, setConfigModal] = useState<{ dropdownKey: string; header: string } | null>(
    null,
  );
  // Track previous rows identity to reset activeIndex on page/search changes
  // (React-recommended setState-during-render pattern — not an effect).
  const [prevRows, setPrevRows] = useState(rows);

  // ── Table sizing: presets + per-column overrides, persisted to localStorage.
  // rowHeight prop acts as the initial seed only when no stored preference exists.
  const sizeConfig = useTableSizeConfig(moduleKey, rowHeight);

  // ── Dropdown option resolver — one hook call; callable for any dropdownKey.
  // Returns [] when no DropdownListConfigProvider wraps this DataView (opt-in).
  const resolveOptions = useDropdownResolver();

  const urlView = searchParams.get("view");
  const view: ViewMode = urlView === "grid" || urlView === "list" ? urlView : initialView;
  const pages = totalPages(totalCount, pageSize);
  const hasQuery =
    Boolean(searchParams.get("q")) || Boolean(searchParams.get("filter")) || filtersActive;

  useEffect(() => {
    announce(messages.feedback.resultsAnnouncement(rows.length, totalCount));
    // Announce whenever the visible result set changes.
  }, [announce, rows.length, totalCount]);

  // P1 fix: reset active index whenever the row set identity changes (search,
  // filter, page) so keyboard nav always starts from a valid index.
  if (prevRows !== rows) {
    setPrevRows(rows);
    setActiveIndex(0);
  }

  const setView = useCallback(
    (next: ViewMode) => {
      const apply = () => update({ view: next });
      // View Transitions API for the grid<->list morph (ADR-0007), CSS-free fallback.
      if ("startViewTransition" in document) {
        (
          document as Document & { startViewTransition: (cb: () => void) => void }
        ).startViewTransition(apply);
      } else {
        apply();
      }
      // Persist server-side (proc + cookie fallback) — fire and forget.
      void saveViewPreference({ moduleKey, viewMode: next }).catch(() => undefined);
    },
    [moduleKey, update],
  );

  const toggleSelected = useCallback((id: string | number) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const row = rows[activeIndex];
      if (row && onOpen) onOpen(row);
    } else if (event.key === " " && bulkActions) {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) toggleSelected(getRowId(row));
    } else if (event.key === "Escape") {
      clearSelection();
    }
  };

  useEffect(() => {
    // Keep the active row visible while arrowing through the list.
    const active = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (totalCount === 0 && !hasQuery) {
    return <>{empty}</>;
  }

  // Column metadata for the size config panel.
  const columnHeaders = columns.map((col) => ({ key: col.key, label: col.header }));

  const viewToggle = (
    <div className="flex items-center gap-2">
      {/* Table size config button — only visible in list/table view */}
      {view === "list" ? (
        <TableSizeConfigButton config={sizeConfig} columnHeaders={columnHeaders} />
      ) : null}
      <div
        role="group"
        aria-label={messages.list.viewToggle}
        className="flex rounded-md border border-line"
      >
        <button
          type="button"
          aria-label={messages.list.viewGrid}
          aria-pressed={view === "grid"}
          data-testid="view-grid"
          onClick={() => setView("grid")}
          className={`flex size-11 items-center justify-center rounded-l-md ${view === "grid" ? "bg-accent-soft text-accent" : "text-ink-muted"}`}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={messages.list.viewList}
          aria-pressed={view === "list"}
          data-testid="view-list"
          onClick={() => setView("list")}
          className={`flex size-11 items-center justify-center rounded-r-md ${view === "list" ? "bg-accent-soft text-accent" : "text-ink-muted"}`}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
            <rect x="1" y="2" width="14" height="2.5" rx="1" />
            <rect x="1" y="7" width="14" height="2.5" rx="1" />
            <rect x="1" y="12" width="14" height="2.5" rx="1" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {renderToolbar ? (
        renderToolbar(viewToggle)
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink-muted" data-testid="result-count">
            {messages.feedback.resultsAnnouncement(rows.length, totalCount)}
          </p>
          {viewToggle}
        </div>
      )}

      {selected.length > 0 && bulkActions ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-accent bg-accent-soft p-2">
          <p className="text-sm font-medium text-ink">
            {messages.list.selectedCount(selected.length)}
          </p>
          <div className="flex items-center gap-2">
            {bulkActions(selected, clearSelection)}
            <button
              type="button"
              onClick={clearSelection}
              className="min-h-11 px-3 text-sm font-medium text-ink-muted"
            >
              {messages.actions.clearSelection}
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
      ) : (
        <div ref={containerRef} onKeyDown={onKeyDown}>
          {view === "grid" ? (
            <ul
              data-testid="data-view-grid"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {rows.map((row, index) => {
                const id = getRowId(row);
                return (
                  <li key={id} data-active={index === activeIndex || undefined}>
                    <DataRowShell
                      index={index}
                      activeIndex={activeIndex}
                      selectable={Boolean(bulkActions)}
                      selectLabel={rowSelectionLabel(row, getRowLabel) ?? String(id)}
                      selected={selected.includes(id)}
                      onToggleSelect={() => toggleSelected(id)}
                      onOpen={onOpen ? () => onOpen(row) : undefined}
                      onFocus={() => setActiveIndex(index)}
                      className="rounded-lg border border-line bg-surface-raised p-4"
                    >
                      {renderCard(row)}
                    </DataRowShell>
                  </li>
                );
              })}
            </ul>
          ) : (
            /* ── Table / list view ──────────────────────────────────────────
               Grid-style borders: every cell gets a full border. The outer
               table has a single rounded border; inner cells share edges so
               there is no double-border effect (border-collapse).
               ─────────────────────────────────────────────────────────────── */
            <div className="overflow-x-auto rounded-md border border-line">
              <table
                data-testid="data-view-table"
                className="w-full border-collapse text-sm"
                style={{ tableLayout: "fixed" }}
              >
                <colgroup>
                  {bulkActions ? <col style={{ width: 44 }} /> : null}
                  {columns.map((col) => {
                    const w = sizeConfig.colWidths[col.key] ?? col.width ?? sizeConfig.defaultColWidth;
                    return <col key={col.key} style={{ width: w }} />;
                  })}
                  {/* Extra <col> for the InlineAddRow action-buttons cell.
                      Must be present whenever addRow is active so table-layout:fixed
                      does not collapse or misalign the action cell. */}
                  {addRow ? <col style={{ width: 72 }} /> : null}
                </colgroup>
                <thead>
                  <tr className="bg-surface-raised text-left">
                    {bulkActions ? (
                      <th
                        className="border border-line px-3 py-2.5 font-medium text-ink-muted"
                        aria-label={messages.actions.selectAll}
                      />
                    ) : null}
                    {columns.map((col) => (
                      <ResizableTh
                        key={col.key}
                        colKey={col.key}
                        priorityClass={priorityClass[col.priority]}
                        onResize={sizeConfig.setColWidth}
                        onConfigClick={
                          col.dropdownKey
                            ? () =>
                                setConfigModal({
                                  dropdownKey: col.dropdownKey!,
                                  header: col.header,
                                })
                            : undefined
                        }
                      >
                        {col.header}
                      </ResizableTh>
                    ))}
                    {/* Empty header cell matching the action column */}
                    {addRow ? (
                      <th className="border border-line px-2 py-2.5" aria-hidden="true" />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const id = getRowId(row);
                    return (
                      <tr
                        key={id}
                        data-active={index === activeIndex || undefined}
                        tabIndex={index === activeIndex ? 0 : -1}
                        onFocus={() => setActiveIndex(index)}
                        onClick={onOpen ? () => onOpen(row) : undefined}
                        className={`${onOpen ? "cursor-pointer" : ""} ${index === activeIndex ? "bg-accent-soft/40" : index % 2 === 0 ? "bg-surface" : "bg-surface-raised/50"}`}
                      >
                        {bulkActions ? (
                          <td
                           className="border border-line px-3"
                           style={{ height: sizeConfig.rowHeight }}
                          >
                            <input
                              type="checkbox"
                              aria-label={rowSelectionLabel(row, getRowLabel) ?? String(id)}
                              checked={selected.includes(id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelected(id)}
                              className="size-5"
                            />
                          </td>
                        ) : null}
                        {columns.map((col) => (
                          <EditableCell
                            key={col.key}
                            col={col}
                            row={row}
                            rowId={id}
                            rowIndex={index}
                            rowHeight={sizeConfig.rowHeight}
                            options={resolveOptions(col.dropdownKey)}
                            onCellChange={onCellChange}
                            setActiveIndex={setActiveIndex}
                            onOpen={onOpen ? () => onOpen(row) : undefined}
                          />
                        ))}
                      </tr>
                    );
                  })}
                  {addRow ? (
                    <InlineAddRow
                      columns={columns}
                      hasBulkColumn={Boolean(bulkActions)}
                      rowHeight={sizeConfig.rowHeight}
                      addLabel={addRow.addLabel}
                      onAdd={addRow.onAdd}
                      resolveOptions={resolveOptions}
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Global dropdown-list config modal — shared across all caret columns */}
      {configModal ? (
        <DropdownListConfigModal
          dropdownKey={configModal.dropdownKey}
          columnHeader={configModal.header}
          open={true}
          onOpenChange={(open) => {
            if (!open) setConfigModal(null);
          }}
        />
      ) : null}

      {pages > 1 ? (
        <nav
          aria-label={messages.list.page(page, pages)}
          className="flex items-center justify-between"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) }, { push: true })}
            className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            {messages.list.previousPage}
          </button>
          <p className="text-sm text-ink-muted">{messages.list.page(page, pages)}</p>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => update({ page: String(page + 1) }, { push: true })}
            className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            {messages.list.nextPage}
          </button>
        </nav>
      ) : null}
    </div>
  );
}

// ── Grid card shell (unchanged) ────────────────────────────────────────────

function DataRowShell({
  index,
  activeIndex,
  selectable,
  selectLabel,
  selected,
  onToggleSelect,
  onOpen,
  onFocus,
  className,
  children,
}: {
  index: number;
  activeIndex: number;
  selectable: boolean;
  selectLabel: string;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen?: () => void;
  onFocus: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      tabIndex={index === activeIndex ? 0 : -1}
      onFocus={onFocus}
      onClick={onOpen}
      className={`relative ${onOpen ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-accent" : ""} ${className}`}
    >
      {selectable ? (
        <input
          type="checkbox"
          aria-label={selectLabel}
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className="absolute top-3 right-3 size-5"
        />
      ) : null}
      {children}
    </div>
  );
}

// ── ResizableTh ─────────────────────────────────────────────────────────────
// A <th> with a drag handle on its right edge. Dragging updates the parent's
// colWidths state for the matching column key.

function ResizableTh({
  colKey,
  priorityClass: cls,
  onResize,
  onConfigClick,
  children,
}: {
  colKey: string;
  priorityClass: string;
  onResize: (key: string, width: number) => void;
  /** When set, renders a caret (▾) button inside the header that opens the dropdown config modal. */
  onConfigClick?: () => void;
  children: React.ReactNode;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const resizeHandleRef = useRef<HTMLSpanElement>(null);
  const widthInputId = useId();
  const [widthPopoverOpen, setWidthPopoverOpen] = useState(false);
  const [widthInputValue, setWidthInputValue] = useState("");

  // Close popover on outside pointer-down and restore focus to the handle.
  useEffect(() => {
    if (!widthPopoverOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (!thRef.current?.contains(e.target as Node)) {
        setWidthPopoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [widthPopoverOpen]);

  // Restore focus to the resize handle when the popover closes.
  const prevPopoverOpen = useRef(false);
  useEffect(() => {
    if (prevPopoverOpen.current && !widthPopoverOpen) {
      resizeHandleRef.current?.focus();
    }
    prevPopoverOpen.current = widthPopoverOpen;
  }, [widthPopoverOpen]);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      // Shift+click → open the exact-width popover instead of dragging.
      if (e.shiftKey) {
        e.preventDefault();
        const currentWidth = thRef.current?.getBoundingClientRect().width ?? 120;
        setWidthInputValue(String(Math.round(currentWidth)));
        setWidthPopoverOpen(true);
        return;
      }
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = thRef.current?.getBoundingClientRect().width ?? 120;

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(48, startWidth + (ev.clientX - startX));
        onResize(colKey, newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colKey, onResize],
  );

  const applyWidth = () => {
    const px = parseInt(widthInputValue, 10);
    if (Number.isFinite(px) && px >= 48) {
      onResize(colKey, px);
    }
    setWidthPopoverOpen(false);
  };

  return (
    <th
      ref={thRef}
      className={`relative border border-line px-3 py-2.5 font-semibold text-ink-muted ${cls}`}
    >
      {onConfigClick ? (
        <button
          type="button"
          onClick={onConfigClick}
          className="inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={typeof children === "string" ? messages.dropdownConfig.configureColumn(children) : undefined}
        >
          {children}
          {/* Caret ▾ */}
          <svg
            viewBox="0 0 10 6"
            className="size-2.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>
      ) : (
        children
      )}
      {/* Drag handle — absolute on the right edge of the header cell.
          Shift+click opens the exact-width input popover.
          tabIndex=-1 allows programmatic focus for keyboard return after popover close. */}
      <span
        ref={resizeHandleRef}
        aria-label={messages.list.columnResizeHandle(typeof children === "string" ? children : "")}
        tabIndex={-1}
        onMouseDown={startResize}
        title={messages.list.columnWidthHint}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-accent/30 active:bg-accent/50 focus:outline-none focus:bg-accent/40"
      />
      {/* Exact-width popover */}
      {widthPopoverOpen ? (
        <div
          role="dialog"
          aria-label={messages.list.columnWidthLabel}
          className="absolute top-full right-0 z-20 mt-1 flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 shadow-md"
        >
          <label htmlFor={widthInputId} className="sr-only">
            {messages.list.columnWidthLabel}
          </label>
          <input
            id={widthInputId}
            type="number"
            min={48}
            max={800}
            value={widthInputValue}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setWidthInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyWidth(); }
              if (e.key === "Escape") { e.preventDefault(); setWidthPopoverOpen(false); }
            }}
            className="w-16 rounded border border-line bg-surface px-2 py-0.5 text-xs tabular-nums text-ink outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-xs text-ink-muted">px</span>
          <button
            type="button"
            onClick={applyWidth}
            className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            {messages.actions.save}
          </button>
          <button
            type="button"
            onClick={() => setWidthPopoverOpen(false)}
            className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted hover:bg-surface-sunken"
          >
            {messages.actions.cancel}
          </button>
        </div>
      ) : null}
    </th>
  );
}

// ── EditableCell ─────────────────────────────────────────────────────────────
// A <td> that toggles between read-mode and edit-mode.
//
// When a column is `editable` and supplies `renderEdit`:
//   - Default: read-mode — shows col.render(row).
//   - Click OR focus → switches to edit-mode — shows InlineCell(col.renderEdit(…)).
//   - Blur OR Escape → reverts to read-mode.
//   - Clicking an editable cell never fires the row-open handler.
//
// When NOT editable, behaves like the original plain <td>.

function EditableCell<Row>({
  col,
  row,
  rowId,
  rowIndex,
  rowHeight,
  options,
  onCellChange,
  setActiveIndex,
  onOpen,
}: {
  col: DataViewColumn<Row>;
  row: Row;
  rowId: string | number;
  rowIndex: number;
  rowHeight: number;
  /** Live dropdown options for this column — [] when not a dropdown column. */
  options: string[];
  onCellChange?: (rowId: string | number, colKey: string, value: string) => void;
  setActiveIndex: (i: number) => void;
  onOpen?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isEditable = col.editable && col.renderEdit && onCellChange;

  const handleClick = (e: React.MouseEvent) => {
    if (isEditable) {
      e.stopPropagation(); // prevent row-open
      setEditing(true);
    } else {
      onOpen?.();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLTableCellElement>) => {
    // Only leave edit mode when focus leaves the cell entirely (not to a child).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditable && e.key === "Escape") {
      e.stopPropagation();
      setEditing(false);
    }
  };

  return (
    <td
      className={`border border-line ${isEditable ? "p-0 cursor-text" : "px-3 py-2"} ${priorityClass[col.priority]}`}
      style={{ height: rowHeight }}
      onClick={handleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {isEditable && editing ? (
        <InlineCell
          rowHeight={rowHeight}
          onFocusCapture={() => setActiveIndex(rowIndex)}
        >
          {col.renderEdit!(row, (value) => onCellChange!(rowId, col.key, value), options)}
        </InlineCell>
      ) : isEditable ? (
        /* Read-mode for editable cell: show render output but hint it's clickable.
           WAI-ARIA: role=button requires Enter and Space to activate.
           The label includes the column header so screen-reader users know what
           field they are about to edit (e.g. "Edit Status"). */
        <div
          tabIndex={0}
          role="button"
          aria-label={`${messages.list.clickToEdit}: ${col.header}`}
          onFocus={() => { setActiveIndex(rowIndex); setEditing(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveIndex(rowIndex);
              setEditing(true);
            }
          }}
          style={{ minHeight: rowHeight }}
          className="flex w-full cursor-text items-center px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {col.render(row)}
        </div>
      ) : (
        col.render(row)
      )}
    </td>
  );
}

// ── InlineCell ──────────────────────────────────────────────────────────────
// Wraps an editable control so it fills the cell and strips away the cell's
// normal padding. Focus events bubble up to set the active row index.

function InlineCell({
  rowHeight,
  onFocusCapture,
  children,
}: {
  rowHeight: number;
  onFocusCapture: () => void;
  children: React.ReactNode;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={cellRef}
      onFocusCapture={onFocusCapture}
      onClick={(e) => {
        // If the click landed on the wrapper (not on the actual input/select),
        // forward focus to the first focusable control so typing starts immediately.
        if (e.target === e.currentTarget) {
          const control = cellRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea",
          );
          control?.focus();
        }
      }}
      style={{ minHeight: rowHeight }}
      className={`
        flex items-center
        [&_input]:h-full [&_input]:min-h-0 [&_input]:w-full [&_input]:border-0
        [&_input]:rounded-none [&_input]:bg-transparent [&_input]:px-3 [&_input]:py-0
        [&_input]:text-sm [&_input]:text-ink [&_input]:outline-none
        [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-inset [&_input:focus-visible]:ring-accent
        [&_select]:h-full [&_select]:min-h-0 [&_select]:w-full [&_select]:border-0
        [&_select]:rounded-none [&_select]:bg-transparent [&_select]:px-3 [&_select]:py-0
        [&_select]:text-sm [&_select]:text-ink [&_select]:outline-none
        [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-inset [&_select:focus-visible]:ring-accent
        [&_textarea]:h-full [&_textarea]:min-h-0 [&_textarea]:w-full [&_textarea]:border-0
        [&_textarea]:rounded-none [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:py-1
        [&_textarea]:text-sm [&_textarea]:text-ink [&_textarea]:outline-none [&_textarea]:resize-none
        [&_textarea:focus-visible]:ring-2 [&_textarea:focus-visible]:ring-inset [&_textarea:focus-visible]:ring-accent
      `}
    >
      {children}
    </div>
  );
}
