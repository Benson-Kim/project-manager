"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PAGE_SIZE, totalPages, type ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "../announcer";
import { EmptyState } from "../states";
import { saveViewPreference } from "./save-view-preference";
import { priorityClass, type DataViewProps } from "./types";
import { useListUrlState } from "./use-list-url-state";

/**
 * The ONE list component (ADR-0006): grid/list toggle (persisted per user per
 * module + URL-synced), server-side paging, selection + bulk bar, roving
 * keyboard navigation, empty/zero-result states. Server Components fetch the
 * page and pass rows down — this component never fetches data.
 */
export function DataView<Row>({
  moduleKey,
  rows,
  totalCount,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  initialView,
  getRowId,
  renderCard,
  columns,
  onOpen,
  bulkActions,
  empty,
}: DataViewProps<Row>) {
  const { searchParams, update } = useListUrlState();
  const { announce } = useAnnouncer();
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const urlView = searchParams.get("view");
  const view: ViewMode = urlView === "grid" || urlView === "list" ? urlView : initialView;
  const pages = totalPages(totalCount, pageSize);
  const hasQuery = Boolean(searchParams.get("q")) || Boolean(searchParams.get("filter"));

  useEffect(() => {
    announce(messages.feedback.resultsAnnouncement(rows.length, totalCount));
    // Announce whenever the visible result set changes.
  }, [announce, rows.length, totalCount]);

  // P1 fix: reset active index whenever the row set identity changes (search,
  // filter, page) so keyboard nav always starts from a valid index.
  useEffect(() => {
    setActiveIndex(0);
  }, [rows]);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted" data-testid="result-count">
          {messages.feedback.resultsAnnouncement(rows.length, totalCount)}
        </p>
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
            <table data-testid="data-view-table" className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {bulkActions ? (
                    <th className="w-11 p-2" aria-label={messages.actions.selectAll} />
                  ) : null}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`p-2 font-medium text-ink-muted ${priorityClass[col.priority]}`}
                    >
                      {col.header}
                    </th>
                  ))}
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
                      className={`min-h-11 border-b border-line ${onOpen ? "cursor-pointer" : ""} ${index === activeIndex ? "bg-surface-raised" : ""}`}
                    >
                      {bulkActions ? (
                        <td className="w-11 p-2">
                          <input
                            type="checkbox"
                            aria-label={String(id)}
                            checked={selected.includes(id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelected(id)}
                            className="size-5"
                          />
                        </td>
                      ) : null}
                      {columns.map((col) => (
                        <td key={col.key} className={`p-2 ${priorityClass[col.priority]}`}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}

function DataRowShell({
  index,
  activeIndex,
  selectable,
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
          aria-label={messages.actions.selectAll}
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
