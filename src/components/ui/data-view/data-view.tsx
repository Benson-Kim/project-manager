"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampRowHeight,
  moveKey,
  normalizeLayout,
  orderColumns,
  type ListLayout,
} from "@/lib/list-layout";
import { optionColor, type LookupListKey, type OptionColor } from "@/lib/lookup-lists";
import { DEFAULT_PAGE_SIZE, totalPages, type ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../announcer";
import { useLookupLists } from "../lookup-lists";
import { EmptyState } from "../states";
import { useToast } from "../toast";
import { TONES } from "../tones";
import { TableLayoutDialog } from "./table-layout-dialog";
import { CELL_WIDTH, DEFAULT_ROW_HEIGHT, isEditableTarget } from "./datasheet";
import {
  DatasheetAddRow,
  DatasheetCell,
  HeaderCell,
  IconButton,
  ResizeHandle,
  cellClass,
  editableCellClass,
} from "./datasheet-cells";
import { ListEditorDialog } from "./list-editor-dialog";
import { saveListLayout, saveViewPreference } from "./save-view-preference";
import { priorityClass, rowSelectionLabel, type DataViewColumn, type DataViewProps } from "./types";
import { useListUrlState } from "./use-list-url-state";

/**
 * The ONE list component (ADR-0006): grid/list toggle (persisted per user per
 * module + URL-synced), server-side paging, selection + bulk bar, roving
 * keyboard navigation, empty/zero-result states. Server Components fetch the
 * page and pass rows down — this component never fetches data.
 *
 * Datasheet mode (ADR-0023, `datasheet` prop): in list view the table is an
 * Access-style grid — editable cells save on Enter/blur through the module's
 * update action, a persistent new-entry row adds records, and list-bound
 * columns carry a caret that opens the dropdown-list editor (Admins, ADR-0022)
 * — so does "Edit list…" at the end of every list-bound select. Coloured values
 * tint their cells; lists set to colour rows tint the whole row (migration 020).
 * In list view every table's layout can be changed — drag a header to move it,
 * drag its edge to resize it, drag a row's bottom edge for the row height, or
 * use the "Table layout" dialog — and it is kept per user per module.
 */
export function DataView<Row>({
  moduleKey,
  rows,
  totalCount,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  initialView,
  initialLayout,
  rowTone,
  getRowId,
  getRowLabel,
  renderCard,
  columns,
  onOpen,
  bulkActions,
  datasheet,
  renderToolbar,
  empty,
  filtersActive = false,
}: DataViewProps<Row>) {
  const router = useRouter();
  const { searchParams, update } = useListUrlState();
  const { announce } = useAnnouncer();
  const { toast } = useToast();
  const { canEdit: canEditLists, lists } = useLookupLists();
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Rows the datasheet saved since the server last sent this page (new RowVer),
  // so a second edit before the refresh lands doesn't conflict.
  const [saved, setSaved] = useState<Map<string | number, Row>>(() => new Map());
  const [editingList, setEditingList] = useState<{ list: LookupListKey; column: string } | null>(
    null,
  );
  const [layout, setLayout] = useState<ListLayout | null>(initialLayout ?? null);
  // The latest layout for saving at the end of a resize gesture (no stale closure).
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const savingRef = useRef<Promise<unknown>>(Promise.resolve());
  const [arranging, setArranging] = useState(false);
  const [drag, setDrag] = useState<{ key: string; over: string | null } | null>(null);
  const shownColumns = orderColumns(columns, layout?.order);
  const rowHeight = layout?.rowHeight ?? DEFAULT_ROW_HEIGHT;
  // Track previous rows identity to reset activeIndex on page/search changes
  // (React-recommended setState-during-render pattern — not an effect).
  const [prevRows, setPrevRows] = useState(rows);

  const urlView = searchParams.get("view");
  const view: ViewMode = urlView === "grid" || urlView === "list" ? urlView : initialView;
  const pages = totalPages(totalCount, pageSize);
  const hasQuery =
    Boolean(searchParams.get("q")) || Boolean(searchParams.get("filter")) || filtersActive;
  const sheet = view === "list" ? datasheet : undefined;

  useEffect(() => {
    announce(messages.feedback.resultsAnnouncement(rows.length, totalCount));
    // Announce whenever the visible result set changes.
  }, [announce, rows.length, totalCount]);

  // P1 fix: reset active index whenever the row set identity changes (search,
  // filter, page) so keyboard nav always starts from a valid index.
  // React-recommended setState-during-render pattern (avoids cascading renders).
  if (prevRows !== rows) {
    setPrevRows(rows);
    setActiveIndex(0);
    setSaved(new Map());
  }

  const shownRows = saved.size ? rows.map((row) => saved.get(getRowId(row)) ?? row) : rows;

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
    if (shownRows.length === 0) return;
    // Keys typed into a cell, select or button belong to that control.
    if (isEditableTarget(event.target as HTMLElement)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, shownRows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const row = shownRows[activeIndex];
      if (row && onOpen) onOpen(row);
    } else if (event.key === " " && bulkActions) {
      event.preventDefault();
      const row = shownRows[activeIndex];
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

  const saveCell = async (row: Row, column: DataViewColumn<Row>, value: string) => {
    if (!sheet || !column.edit) return false;
    const result = await sheet.saveCell(row, column.edit.field, value);
    if (!result.ok) {
      toast({ variant: "error", title: result.error.message });
      return false;
    }
    setSaved((current) => new Map(current).set(getRowId(row), { ...row, ...result.data }));
    announce(messages.datasheet.saved(column.header));
    router.refresh();
    return true;
  };

  const addEntry = async (values: Record<string, string>) => {
    const result = await sheet!.addRow!.add(values);
    if (result.ok) {
      announce(messages.datasheet.added);
      router.refresh();
    } else {
      toast({ variant: "error", title: result.error.message });
    }
    return result;
  };

  /** Stores a layout (null = the module's default) and shows it. */
  const saveLayout = (next: ListLayout | null) => {
    const stored = normalizeLayout(
      columns.map((column) => column.key),
      next,
    );
    setLayout(stored);
    layoutRef.current = stored;
    // One save at a time, in order: two quick arrow-key steps must not land out of order.
    savingRef.current = savingRef.current
      .then(() => saveListLayout({ moduleKey, layout: stored }))
      .catch(() => undefined);
  };

  const applyColumnOrder = (keys: string[]) => {
    saveLayout({ ...layoutRef.current, order: keys });
    announce(messages.datasheet.columnsArranged);
  };

  /** Drops the dragged header onto `target`: the dragged column takes its place. */
  const dropColumn = (target: string) => {
    const dragged = drag?.key;
    setDrag(null);
    if (!dragged || dragged === target) return;
    const keys = shownColumns.map((column) => column.key);
    applyColumnOrder(moveKey(keys, keys.indexOf(dragged), keys.indexOf(target)));
  };

  /**
   * A live resize (drag or arrow keys) — stored by commitLayout when the gesture ends. The ref is
   * updated here, not only by the effect, because a key-up can commit before the effect runs.
   */
  const showLayout = (next: ListLayout) => {
    layoutRef.current = next;
    setLayout(next);
  };
  const resizeColumn = (key: string, width: number) =>
    showLayout({
      ...layoutRef.current,
      widths: { ...layoutRef.current?.widths, [key]: width },
    });
  const resizeRows = (height: number) =>
    showLayout({ ...layoutRef.current, rowHeight: clampRowHeight(height) });
  const commitLayout = () => saveLayout(layoutRef.current);

  /** A resized column's fixed width (header, cells and new-entry row alike). */
  const columnStyle = (column: DataViewColumn<Row>): React.CSSProperties | undefined => {
    const width = layout?.widths?.[column.key];
    return width ? { width, minWidth: width, maxWidth: width } : undefined;
  };

  /**
   * A row's colour: the module's own rule first (e.g. an overdue to-do), then
   * its value in the first column — in display order — whose list colours rows.
   */
  const toneOf = (row: Row): OptionColor | null => {
    const own = rowTone?.(row);
    if (own) return own;
    for (const column of shownColumns) {
      const list = column.edit?.list ? lists[column.edit.list] : undefined;
      if (list?.tintRows) {
        const color = optionColor(list, column.edit!.value(row));
        if (color) return color;
      }
    }
    return null;
  };

  const editList =
    canEditLists && sheet
      ? (list: LookupListKey, column: string) => setEditingList({ list, column })
      : undefined;

  // A datasheet with a new-entry row stays a table even before the first record.
  if (totalCount === 0 && !hasQuery && !sheet?.addRow) {
    return <>{empty}</>;
  }

  const rowLabel = (row: Row) => (getRowLabel ? getRowLabel(row) : String(getRowId(row)));

  const arrangeButton =
    view === "list" ? (
      <button
        type="button"
        aria-label={messages.datasheet.tableLayout}
        title={messages.datasheet.tableLayout}
        data-testid="table-layout"
        onClick={() => setArranging(true)}
        className="flex size-11 items-center justify-center rounded-md border border-line text-ink-muted hover:bg-surface-sunken"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="1.5" y="2" width="3.5" height="12" rx="0.75" />
          <rect x="6.25" y="2" width="3.5" height="12" rx="0.75" />
          <path d="M12 5l2 2-2 2M14 7h-2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    ) : null;

  const viewModes = (
    <div
      role="group"
      aria-label={messages.list.viewToggle}
      className="flex rounded-md border border-line"
    >
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
    </div>
  );

  // Modules place this in their toolbar (renderToolbar); "Arrange columns" sits beside the toggle.
  const viewToggle = (
    <div className="flex items-center gap-2">
      {arrangeButton}
      {viewModes}
    </div>
  );

  // The new-entry row is persistent (client feedback §3): it stays under the data
  // with a search or filter active too — like Access's new-record row.
  const showTable = view === "list" && (shownRows.length > 0 || Boolean(sheet?.addRow));
  const actionsColumn = Boolean(sheet && (onOpen || sheet.addRow));

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

      {shownRows.length === 0 && !showTable ? (
        <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
      ) : (
        <div ref={containerRef} onKeyDown={onKeyDown}>
          {view === "grid" ? (
            <ul
              data-testid="data-view-grid"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {shownRows.map((row, index) => {
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
            // `relative`: absolutely positioned descendants (sr-only labels) belong to this
            // scroller, not to <main> — else a wide table stretches the whole page.
            <div className="relative overflow-x-auto">
              <table
                data-testid="data-view-table"
                style={{ "--row-h": `${rowHeight}px` } as React.CSSProperties}
                className="w-full border-collapse border border-line text-sm"
              >
                <thead>
                  <tr>
                    {bulkActions ? (
                      <th
                        className="w-11 border border-line bg-surface-raised p-2"
                        aria-label={messages.actions.selectAll}
                      />
                    ) : null}
                    {shownColumns.map((col) => (
                      <HeaderCell
                        key={col.key}
                        column={col}
                        canEditLists={Boolean(sheet) && canEditLists}
                        onEditList={(list, column) => setEditingList({ list, column })}
                        resize={{
                          width: layout?.widths?.[col.key],
                          onResize: (width) => resizeColumn(col.key, width),
                          onCommit: commitLayout,
                        }}
                        drag={{
                          dragging: drag?.key === col.key,
                          over: Boolean(drag) && drag?.over === col.key && drag.key !== col.key,
                          onStart: () => setDrag({ key: col.key, over: null }),
                          onOver: () =>
                            setDrag((current) =>
                              current && current.over !== col.key
                                ? { ...current, over: col.key }
                                : current,
                            ),
                          onDrop: () => dropColumn(col.key),
                          onEnd: () => setDrag(null),
                        }}
                      />
                    ))}
                    {actionsColumn ? (
                      <th className="w-24 border border-line bg-surface-raised px-3 py-2 text-left font-medium text-ink-muted">
                        <span className="sr-only">{messages.datasheet.actions}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row, index) => {
                    const id = getRowId(row);
                    const editable = Boolean(sheet?.canEditRow(row));
                    const tone = toneOf(row);
                    // Access-style row height: the first cell's bottom edge resizes every row
                    // (pointer only; the Table layout dialog is the keyboard way).
                    const rowHandle = (
                      <ResizeHandle
                        label={messages.datasheet.resizeRows}
                        orientation="horizontal"
                        value={layout?.rowHeight}
                        estimate={rowHeight}
                        onResize={resizeRows}
                        onCommit={commitLayout}
                        measure={() => rowHeight}
                        focusable={false}
                        className="absolute -bottom-1 left-0 z-10 h-2 w-full cursor-row-resize"
                      />
                    );
                    return (
                      <tr
                        key={id}
                        data-active={index === activeIndex || undefined}
                        tabIndex={index === activeIndex ? 0 : -1}
                        onFocus={() => setActiveIndex(index)}
                        onClick={
                          onOpen
                            ? (e) => {
                                // Clicks on a cell's control edit it; the rest of the row opens the record.
                                if (!isEditableTarget(e.target as HTMLElement)) onOpen(row);
                              }
                            : undefined
                        }
                        data-tone={tone ?? undefined}
                        className={`${onOpen ? "cursor-pointer" : ""} ${tone ? TONES[tone].fill : index === activeIndex ? "bg-surface-raised" : ""}`}
                      >
                        {bulkActions ? (
                          <td className={`relative w-11 ${cellClass} px-2`}>
                            <input
                              type="checkbox"
                              aria-label={rowSelectionLabel(row, getRowLabel) ?? String(id)}
                              checked={selected.includes(id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelected(id)}
                              className="size-5"
                            />
                            {rowHandle}
                          </td>
                        ) : null}
                        {shownColumns.map((col, colIndex) => {
                          const handle = !bulkActions && colIndex === 0 ? rowHandle : null;
                          const style = columnStyle(col);
                          return editable && col.edit ? (
                            <td
                              key={col.key}
                              style={style}
                              className={`relative ${editableCellClass} ${style ? "" : CELL_WIDTH[col.edit.kind]} ${priorityClass[col.priority]}`}
                            >
                              <DatasheetCell
                                row={row}
                                editor={col.edit}
                                label={messages.datasheet.cellLabel(col.header, rowLabel(row))}
                                onSave={(value) => saveCell(row, col, value)}
                                onEditList={
                                  col.edit.list && editList
                                    ? () => editList(col.edit!.list!, col.header)
                                    : undefined
                                }
                              />
                              {handle}
                            </td>
                          ) : (
                            <td
                              key={col.key}
                              style={style}
                              className={`relative ${cellClass} ${style ? "truncate" : ""} ${priorityClass[col.priority]}`}
                            >
                              {col.render(row)}
                              {handle}
                            </td>
                          );
                        })}
                        {actionsColumn ? (
                          <td className={`${cellClass} py-1`}>
                            {onOpen ? (
                              <IconButton
                                label={messages.datasheet.open(rowLabel(row))}
                                onClick={() => onOpen(row)}
                              >
                                <path d="M6 3h7v7M13 3L5 11" />
                              </IconButton>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {sheet?.addRow ? (
                    <DatasheetAddRow
                      columns={shownColumns}
                      hasSelectColumn={Boolean(bulkActions)}
                      columnStyle={columnStyle}
                      onAdd={addEntry}
                      onEditList={editList}
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

      <TableLayoutDialog
        columns={shownColumns}
        rowHeight={rowHeight}
        open={arranging}
        onOpenChange={setArranging}
        onApply={({ order, rowHeight: height }) => {
          saveLayout({
            ...layoutRef.current,
            order,
            rowHeight: height === DEFAULT_ROW_HEIGHT ? undefined : height,
          });
          announce(messages.datasheet.layoutSaved);
        }}
        onReset={() => {
          saveLayout(null);
          announce(messages.datasheet.layoutSaved);
        }}
      />

      {editingList ? (
        <ListEditorDialog
          listKey={editingList.list}
          column={editingList.column}
          open
          onOpenChange={(open) => {
            if (!open) setEditingList(null);
          }}
        />
      ) : null}
    </div>
  );
}

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
  // When the card is openable, use a <button> so keyboard users can activate
  // it with Enter/Space without any extra event handler (WCAG 2.1 SC 2.1.1).
  // When not openable, a plain <div> is sufficient (no interaction contract).
  const Tag = onOpen ? "button" : "div";
  const card = (
    <Tag
      // "button" needs type to avoid submitting parent forms accidentally.
      {...(onOpen ? { type: "button" as const } : {})}
      tabIndex={index === activeIndex ? 0 : -1}
      onFocus={onFocus}
      onClick={onOpen}
      className={`relative w-full text-left ${onOpen ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-accent" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
  if (!selectable) return card;
  // The checkbox sits over the card as a sibling: a control nested inside the
  // card's <button> is not reliably announced or operable (axe nested-interactive).
  return (
    <div className="relative w-full">
      {card}
      <input
        type="checkbox"
        aria-label={selectLabel}
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSelect}
        className="absolute top-3 right-3 z-10 size-5"
      />
    </div>
  );
}
