"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { clampWidth, COLUMN_WIDTH_MIN, RESIZE_STEP } from "@/lib/list-layout";
import { optionColor, type LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { useLookupLists } from "../lookup-lists";
import { TONES } from "../tones";
import {
  CELL_WIDTH,
  CELL_WIDTH_PX,
  cellChoices,
  emptyDraft,
  hasDraft,
  invalidFields,
  isCellChanged,
  type CellEditor,
} from "./datasheet";
import { priorityClass, type DataViewColumn } from "./types";

/**
 * The datasheet's cells (ADR-0023): Access-style inputs that fill the grid
 * cell, the persistent new-entry row, and the header (caret to the list
 * editor, drag to move, edge to resize). DataView owns saving, feedback,
 * refresh and the layout.
 */

/**
 * Grid borders and spacious cells for every list table (client feedback §2).
 * Rows follow the user's row height: DataView sets --row-h on the table.
 */
export const cellClass = "h-(--row-h) border border-line px-3 py-2 align-middle";
export const editableCellClass = "h-(--row-h) border border-line p-0 align-middle";

/**
 * Cells read as text until touched: hover tints them, focus turns them into a
 * white input. Text inherits the row's colour (a tinted row, migration 020).
 */
const controlClass =
  "h-(--row-h) w-full min-w-0 border-0 bg-transparent px-3 text-sm text-inherit " +
  "hover:bg-surface-sunken focus:bg-surface focus:text-ink placeholder:text-ink-muted " +
  "aria-invalid:bg-danger-soft disabled:opacity-60";

/** The select choice that opens the list editor instead of picking a value. */
const EDIT_LIST = "__edit-list__";

interface CellControlProps<Row> {
  editor: CellEditor<Row>;
  value: string;
  label: string;
  /** Empty-choice text of a select; ghost text of an input. */
  placeholder?: string;
  invalid?: boolean;
  pending?: boolean;
  choices: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  onEnter: (value: string) => void;
  onEscape: () => void;
  onBlur?: (value: string) => void;
  /** Data cells save a select as soon as it changes; the new-entry row waits for Enter or ✓. */
  commitSelect?: boolean;
  /** Admins: a list-bound select ends with "Edit list…", which opens the list editor. */
  onEditList?: () => void;
}

function CellControl<Row>({
  editor,
  value,
  label,
  placeholder,
  invalid,
  pending,
  choices,
  onChange,
  onEnter,
  onEscape,
  onBlur,
  commitSelect,
  onEditList,
}: CellControlProps<Row>) {
  const { lists } = useLookupLists();
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter(e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEscape();
    }
  };
  const aria = {
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    "aria-busy": pending || undefined,
  };

  if (editor.kind === "select") {
    // A coloured value tints its cell (migration 020).
    const tone = editor.list ? optionColor(lists[editor.list], value) : null;
    return (
      <select
        {...aria}
        value={value}
        onChange={(e) => {
          if (e.target.value === EDIT_LIST) {
            onEditList?.();
            return;
          }
          onChange(e.target.value);
          if (commitSelect) onEnter(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={`${controlClass} cursor-pointer ${tone ? `${TONES[tone].fill} font-medium` : ""}`}
      >
        {editor.clearable === false ? null : (
          <option value="">{placeholder ?? editor.emptyLabel ?? messages.datasheet.noValue}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
        {onEditList ? <option value={EDIT_LIST}>{messages.lookupLists.editInline}</option> : null}
      </select>
    );
  }

  return (
    <input
      {...aria}
      type={editor.kind}
      value={value}
      placeholder={placeholder}
      maxLength={editor.maxLength}
      min={editor.min}
      max={editor.max}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur ? (e) => onBlur(e.currentTarget.value) : undefined}
      className={`${controlClass} cursor-text`}
    />
  );
}

/** An editable data cell: saves on Enter, on blur, or when a select changes; Esc restores. */
export function DatasheetCell<Row>({
  row,
  editor,
  label,
  onSave,
  onEditList,
}: {
  row: Row;
  editor: CellEditor<Row>;
  label: string;
  /** Resolves true when saved; false restores the row's value. */
  onSave: (value: string) => Promise<boolean>;
  onEditList?: () => void;
}) {
  const { lists } = useLookupLists();
  const original = editor.value(row);
  const [value, setValue] = useState(original);
  const [pending, setPending] = useState(false);
  // A refreshed row replaces what the cell shows (setState-during-render, not an effect).
  const [prevOriginal, setPrevOriginal] = useState(original);
  if (prevOriginal !== original) {
    setPrevOriginal(original);
    setValue(original);
  }

  const commit = async (next: string) => {
    if (pending || !isCellChanged(editor.kind, original, next)) return;
    setPending(true);
    const saved = await onSave(next);
    setPending(false);
    if (!saved) setValue(original);
  };

  return (
    <CellControl
      editor={editor}
      value={value}
      label={label}
      pending={pending}
      choices={
        editor.kind === "select"
          ? cellChoices(editor, lists, {
              value: original,
              label: editor.currentLabel?.(row) ?? null,
            })
          : []
      }
      onChange={setValue}
      onEnter={(next) => void commit(next)}
      onBlur={(next) => void commit(next)}
      onEscape={() => setValue(original)}
      commitSelect
      onEditList={onEditList}
    />
  );
}

/**
 * The persistent new-entry row under the data (client feedback §3): ghost
 * placeholders in every editable column, ✓ / × in the last column, Enter in any
 * field adds the entry and clears the row for the next one.
 */
export function DatasheetAddRow<Row>({
  columns,
  hasSelectColumn,
  columnStyle,
  onAdd,
  onEditList,
}: {
  columns: DataViewColumn<Row>[];
  hasSelectColumn: boolean;
  /** A resized column's width (DataView's layout). */
  columnStyle: (column: DataViewColumn<Row>) => React.CSSProperties | undefined;
  onAdd: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
  /** Admins: "Edit list…" in list-bound selects. */
  onEditList?: (list: LookupListKey, column: string) => void;
}) {
  const { lists } = useLookupLists();
  const editors = columns.flatMap((column) => (column.edit ? [column.edit] : []));
  const fresh = emptyDraft(editors);
  const [draft, setDraft] = useState(fresh);
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  // New starting values (e.g. another project filter) restart the draft
  // (setState-during-render, not an effect).
  const freshKey = JSON.stringify(fresh);
  const [prevFreshKey, setPrevFreshKey] = useState(freshKey);
  if (prevFreshKey !== freshKey) {
    setPrevFreshKey(freshKey);
    setDraft(fresh);
    setInvalid(new Set());
  }
  const filled = hasDraft(draft, fresh);

  const reset = () => {
    setDraft(fresh);
    setInvalid(new Set());
  };

  const commit = async () => {
    if (pending || !filled) return;
    setPending(true);
    const result = await onAdd(draft);
    setPending(false);
    if (result.ok) {
      reset();
      rowRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    } else {
      setInvalid(invalidFields(result.error.fieldErrors));
    }
  };

  return (
    <tr ref={rowRef} data-testid="datasheet-add-row" className="bg-surface-raised">
      {hasSelectColumn ? <td className={cellClass} /> : null}
      {columns.map((column) => {
        const edit = column.edit;
        return (
          <td
            key={column.key}
            style={columnStyle(column)}
            className={`${edit ? `${editableCellClass} ${columnStyle(column) ? "" : CELL_WIDTH[edit.kind]}` : cellClass} ${priorityClass[column.priority]}`}
          >
            {edit ? (
              <CellControl
                editor={edit}
                value={draft[edit.field] ?? ""}
                label={messages.datasheet.newEntryField(column.header)}
                placeholder={edit.placeholder}
                invalid={invalid.has(edit.field)}
                choices={edit.kind === "select" ? cellChoices(edit, lists) : []}
                onChange={(value) => setDraft((current) => ({ ...current, [edit.field]: value }))}
                onEnter={() => void commit()}
                onEscape={reset}
                onEditList={
                  edit.list && onEditList ? () => onEditList(edit.list!, column.header) : undefined
                }
              />
            ) : null}
          </td>
        );
      })}
      <td className={`${cellClass} whitespace-nowrap py-1`}>
        <div className="flex items-center gap-1">
          <IconButton
            label={messages.datasheet.addEntry}
            onClick={() => void commit()}
            disabled={pending || !filled}
            className="text-success"
          >
            <path d="M3 8.5l3.5 3.5L13 5" />
          </IconButton>
          <IconButton label={messages.datasheet.clearEntry} onClick={reset} disabled={pending}>
            <path d="M4 4l8 8M12 4l-8 8" />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

/** Drag-to-reorder wiring of a header (ADR-0023); DataView owns the order. */
export interface HeaderDrag {
  /** This header is where the dragged column would land. */
  over: boolean;
  /** This header is being dragged. */
  dragging: boolean;
  onStart: () => void;
  onOver: () => void;
  onDrop: () => void;
  onEnd: () => void;
}

/** Resize wiring of a header's right edge; DataView owns the widths. */
export interface HeaderResize {
  /** The column's width when the user set one. */
  width: number | undefined;
  /** Live width while dragging or arrowing (not yet stored). */
  onResize: (width: number) => void;
  /** Store the width (pointer released, key released). */
  onCommit: () => void;
}

/**
 * A column header: drag it onto another header to move the column (the
 * "Table layout" dialog is the keyboard way); drag its right edge — or focus
 * the edge and use the arrow keys — to resize it; list-bound columns get the ∨
 * caret that opens the list editor (Admins).
 */
export function HeaderCell<Row>({
  column,
  canEditLists,
  onEditList,
  drag,
  resize,
}: {
  column: DataViewColumn<Row>;
  canEditLists: boolean;
  onEditList: (list: LookupListKey, column: string) => void;
  drag?: HeaderDrag;
  resize?: HeaderResize;
}) {
  const list = column.edit?.list;
  const thRef = useRef<HTMLTableCellElement>(null);
  const width = resize?.width;
  return (
    <th
      ref={thRef}
      scope="col"
      data-column={column.key}
      draggable={drag ? true : undefined}
      onDragStart={
        drag
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", column.key);
              drag.onStart();
            }
          : undefined
      }
      onDragOver={
        drag
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              drag.onOver();
            }
          : undefined
      }
      onDrop={
        drag
          ? (e) => {
              e.preventDefault();
              drag.onDrop();
            }
          : undefined
      }
      onDragEnd={drag?.onEnd}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      className={`relative border border-line px-3 py-2 text-left font-medium text-ink-muted ${drag ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.over ? "bg-accent-soft" : "bg-surface-raised"} ${drag?.dragging ? "opacity-50" : ""} ${column.edit && !width ? CELL_WIDTH[column.edit.kind] : ""} ${priorityClass[column.priority]}`}
    >
      <div className="flex min-h-10 items-center justify-between gap-1">
        <span className="truncate">{column.header}</span>
        {list && canEditLists ? (
          <IconButton
            label={messages.lookupLists.edit(column.header)}
            onClick={() => onEditList(list, column.header)}
          >
            <path d="M4 6l4 4 4-4" />
          </IconButton>
        ) : null}
      </div>
      {resize ? (
        <ResizeHandle
          label={messages.datasheet.resizeColumn(column.header)}
          orientation="vertical"
          value={width}
          estimate={column.edit ? CELL_WIDTH_PX[column.edit.kind] : COLUMN_WIDTH_MIN}
          onResize={(next) => resize.onResize(clampWidth(next))}
          onCommit={resize.onCommit}
          measure={() => thRef.current?.offsetWidth ?? 0}
          className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize"
        />
      ) : null}
    </th>
  );
}

/**
 * A splitter (WAI-ARIA "window splitter"): drag it, or focus it and use the
 * arrow keys. `measure` reads the size when a drag starts; vertical handles
 * resize along x (columns), horizontal ones along y (rows).
 */
export function ResizeHandle({
  label,
  orientation,
  value,
  estimate,
  onResize,
  onCommit,
  measure,
  className,
  focusable = true,
}: {
  label: string;
  orientation: "vertical" | "horizontal";
  /** The current size, once the user set one. */
  value: number | undefined;
  /** The default size in px before it is measured (server render, hydration). */
  estimate: number;
  onResize: (size: number) => void;
  onCommit: () => void;
  measure: () => number;
  className: string;
  /** Only one handle per axis needs a tab stop (e.g. rows: the dialog covers keyboard). */
  focusable?: boolean;
}) {
  const start = useRef<{ pointer: number; size: number } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  // A focusable splitter must expose its size (aria-valuenow): the user's size, else an estimate on
  // the server, then the rendered size, written straight to the DOM so measuring never re-renders.
  useLayoutEffect(() => {
    if (value === undefined && focusable) {
      handle.current?.setAttribute("aria-valuenow", String(Math.round(measure())));
    }
  });
  const axis = (e: React.PointerEvent) => (orientation === "vertical" ? e.clientX : e.clientY);
  const [less, more] =
    orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  return (
    <div
      ref={handle}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value ?? estimate)}
      tabIndex={focusable ? 0 : -1}
      aria-hidden={focusable ? undefined : true}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // Don't start the header's drag-to-move or select text.
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pointer: axis(e), size: measure() };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize(start.current.size + axis(e) - start.current.pointer);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key !== less && e.key !== more) return;
        e.preventDefault();
        e.stopPropagation();
        onResize((value ?? measure()) + (e.key === more ? RESIZE_STEP : -RESIZE_STEP));
      }}
      onKeyUp={(e) => {
        if (e.key === less || e.key === more) onCommit();
      }}
      className={`touch-none hover:bg-accent/40 focus-visible:bg-accent/40 ${className}`}
    />
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex min-h-10 min-w-9 items-center justify-center rounded-md hover:bg-surface-sunken disabled:opacity-40 ${className ?? "text-ink-muted"}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
