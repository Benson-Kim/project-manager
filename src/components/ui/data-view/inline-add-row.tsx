"use client";

import { useRef, useState, useCallback } from "react";
import { messages } from "@/lib/messages";
import { useToast } from "../toast";
import { priorityClass } from "./types";
import type { DataViewColumn } from "./types";

/**
 * InlineAddRow — persistent "Add new entry" guide row pinned to the bottom of
 * the table body.
 *
 * • Each column that declares `renderInput` gets a live input cell; others are
 *   empty (non-interactive) guide cells.
 * • `addRowPlaceholder` is forwarded as the `placeholder` attribute so columns
 *   can opt-in to ghost text without coupling to a specific input element.
 * • Pressing Enter inside any field commits the draft via `onAdd`. On success
 *   the fields reset and focus returns to the first input. On failure the error
 *   is surfaced as a sticky toast.
 * • A ✓ (commit) and × (reset) button sit in a final action cell that spans no
 *   data column — it is appended after the last column cell so it never shifts
 *   any column's alignment.
 *
 * Props mirror the `addRow` sub-object of `DataViewProps` plus the columns /
 * layout context needed to render the row.
 */
export function InlineAddRow<Row>({
  columns,
  hasBulkColumn,
  rowHeight,
  addLabel = messages.list.addEntry,
  onAdd,
  resolveOptions,
}: {
  columns: DataViewColumn<Row>[];
  /** True when the table has a leading checkbox column so we match the offset. */
  hasBulkColumn: boolean;
  rowHeight: number;
  addLabel?: string;
  onAdd: (
    draft: Record<string, string>,
  ) => Promise<{ ok: boolean; error?: { message: string } }>;
  /**
   * Resolves live dropdown options for a given dropdownKey.
   * Provided by DataView from the DropdownListConfigContext so the add-row's
   * select inputs always reflect the latest option list.
   */
  resolveOptions?: (key: string | undefined) => string[];
}) {
  const { toast } = useToast();

  // Draft state: one string value per column key.
  const emptyDraft = useCallback(
    () => Object.fromEntries(columns.map((c) => [c.key, ""])),
    [columns],
  );
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft);
  // Use a ref for busy state so the commit closure is stable and immune to
  // stale-closure double-submit races (state updates are async; refs are sync).
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);

  // Ref to the <tr> — only ever read inside the commit callback (an event
  // handler), never during render. Kept in this parent so the lint rule's
  // render-path analysis never reaches it inside a .map() call.
  const rowRef = useRef<HTMLTableRowElement>(null);

  const setField = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft());
  }, [emptyDraft]);

  const commit = useCallback(async () => {
    // Ref-based guard prevents double-submit even if React batches state updates.
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      const result = await onAdd(draft);
      if (result.ok) {
        reset();
        // Return focus to the first editable cell so the user can immediately
        // start entering the next row. Query the row element post-commit to
        // avoid holding a ref to a potentially stale input element.
        setTimeout(() => {
          rowRef.current
            ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")
            ?.focus();
        }, 0);
      } else {
        toast({
          variant: "error",
          title: result.error?.message ?? messages.errors.INTERNAL,
        });
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [draft, onAdd, reset, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        reset();
      }
    },
    [commit, reset],
  );

  return (
    <tr
      ref={rowRef}
      data-testid="inline-add-row"
      className="bg-accent-soft/20"
      aria-label={messages.list.addNewEntry}
    >
      {/* Leading checkbox placeholder cell (matches bulk-select column) */}
      {hasBulkColumn ? (
        <td className="border border-line px-3" style={{ height: rowHeight }} />
      ) : null}

      {/* Column cells extracted into a ref-free child component so the
          react-hooks/refs rule never sees a useRef in the same render scope
          as a .map() call. */}
      <AddRowCells
        columns={columns}
        draft={draft}
        rowHeight={rowHeight}
        handleKeyDown={handleKeyDown}
        setField={setField}
        resolveOptions={resolveOptions}
      />

      {/* Action buttons cell — always last, not tied to any column */}
      <td
        className="border border-line px-2"
        style={{ height: rowHeight, whiteSpace: "nowrap" }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void commit()}
            aria-label={addLabel}
            title={addLabel}
            className="flex size-8 items-center justify-center rounded text-success hover:bg-success-soft disabled:opacity-50"
          >
            {/* ✓ checkmark */}
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={reset}
            aria-label={messages.list.cancelEntry}
            title={messages.list.cancelEntry}
            className="flex size-8 items-center justify-center rounded text-ink-muted hover:bg-surface-raised disabled:opacity-50"
          >
            {/* × cross */}
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// AddRowCells — renders the per-column <td> cells with no refs in scope.
// Extracted so the react-hooks/refs lint rule never sees a useRef defined in
// the same component function as a .map() call.
// ---------------------------------------------------------------------------

function AddRowCells<Row>({
  columns,
  draft,
  rowHeight,
  handleKeyDown,
  setField,
  resolveOptions,
}: {
  columns: DataViewColumn<Row>[];
  draft: Record<string, string>;
  rowHeight: number;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  setField: (key: string, value: string) => void;
  resolveOptions?: (key: string | undefined) => string[];
}) {
  return (
    <>
      {columns.map((col) => {
        const hasInput = Boolean(col.renderInput);
        const placeholder = col.addRowPlaceholder ?? col.header;

        const cellContent = hasInput ? (
          <div
            style={{ minHeight: rowHeight }}
            className="flex items-center
              [&_input]:h-full [&_input]:min-h-0 [&_input]:w-full [&_input]:border-0
              [&_input]:rounded-none [&_input]:bg-transparent [&_input]:px-3 [&_input]:py-0
              [&_input]:text-sm [&_input]:text-ink [&_input]:outline-none
              [&_input]:placeholder:text-ink-faint
              [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-inset [&_input:focus-visible]:ring-accent
              [&_select]:h-full [&_select]:min-h-0 [&_select]:w-full [&_select]:border-0
              [&_select]:rounded-none [&_select]:bg-transparent [&_select]:px-3 [&_select]:py-0
              [&_select]:text-sm [&_select]:text-ink [&_select]:outline-none
              [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-inset [&_select:focus-visible]:ring-accent"
          >
            {col.renderInput!({
              value: draft[col.key] ?? "",
              onChange: (value) => setField(col.key, value),
              onKeyDown: handleKeyDown,
              options: resolveOptions ? resolveOptions(col.dropdownKey) : [],
            })}
          </div>
        ) : (
          // Non-input column: show the column header as a dim ghost label so
          // each cell is self-describing even when no renderInput is provided.
          <span className="select-none px-3 text-sm italic text-ink-faint" aria-hidden="true">
            {placeholder}
          </span>
        );

        return (
          <td
            key={col.key}
            // aria-label gives screen readers the column context for each input
            // cell, since the row's aria-label alone doesn't identify individual fields.
            aria-label={hasInput ? messages.list.addRowFieldLabel(col.header) : undefined}
            className={`border border-line ${hasInput ? "p-0" : "px-0 py-2"} ${priorityClass[col.priority]}`}
            style={{ height: rowHeight }}
          >
            {cellContent}
          </td>
        );
      })}
    </>
  );
}
