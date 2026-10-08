"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import type { LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { useLookupLists } from "../lookup-lists";
import {
  CELL_WIDTH,
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
 * cell, the persistent new-entry row, and the header caret that opens the
 * dropdown-list editor. DataView owns saving, feedback and refresh.
 */

/** Grid borders and spacious cells for every list table (client feedback §2). */
export const cellClass = "border border-line px-3 py-3 align-middle";
export const editableCellClass = "border border-line p-0 align-middle";

const controlClass =
  "h-12 w-full min-w-0 border-0 bg-transparent px-3 text-sm text-ink " +
  "placeholder:text-ink-muted aria-invalid:bg-danger-soft disabled:opacity-60";

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
}: CellControlProps<Row>) {
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
    return (
      <select
        {...aria}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (commitSelect) onEnter(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={controlClass}
      >
        {editor.clearable === false ? null : (
          <option value="">{placeholder ?? messages.datasheet.noValue}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
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
      className={controlClass}
    />
  );
}

/** An editable data cell: saves on Enter, on blur, or when a select changes; Esc restores. */
export function DatasheetCell<Row>({
  row,
  editor,
  label,
  onSave,
}: {
  row: Row;
  editor: CellEditor<Row>;
  label: string;
  /** Resolves true when saved; false restores the row's value. */
  onSave: (value: string) => Promise<boolean>;
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
  onAdd,
}: {
  columns: DataViewColumn<Row>[];
  hasSelectColumn: boolean;
  onAdd: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
}) {
  const { lists } = useLookupLists();
  const editors = columns.flatMap((column) => (column.edit ? [column.edit] : []));
  const [draft, setDraft] = useState(() => emptyDraft(editors));
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  const reset = () => {
    setDraft(emptyDraft(editors));
    setInvalid(new Set());
  };

  const commit = async () => {
    if (pending || !hasDraft(draft)) return;
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
      {columns.map((column) => (
        <td
          key={column.key}
          className={`${column.edit ? `${editableCellClass} ${CELL_WIDTH[column.edit.kind]}` : cellClass} ${priorityClass[column.priority]}`}
        >
          {column.edit ? (
            <CellControl
              editor={column.edit}
              value={draft[column.edit.field] ?? ""}
              label={messages.datasheet.newEntryField(column.header)}
              placeholder={column.edit.placeholder}
              invalid={invalid.has(column.edit.field)}
              choices={column.edit.kind === "select" ? cellChoices(column.edit, lists) : []}
              onChange={(value) => {
                const field = column.edit!.field;
                setDraft((current) => ({ ...current, [field]: value }));
              }}
              onEnter={() => void commit()}
              onEscape={reset}
            />
          ) : null}
        </td>
      ))}
      <td className={`${cellClass} whitespace-nowrap py-1`}>
        <div className="flex items-center gap-1">
          <IconButton
            label={messages.datasheet.addEntry}
            onClick={() => void commit()}
            disabled={pending || !hasDraft(draft)}
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

/** A column header; list-bound columns get the ∨ caret that opens the list editor (Admins). */
export function HeaderCell<Row>({
  column,
  canEditLists,
  onEditList,
}: {
  column: DataViewColumn<Row>;
  canEditLists: boolean;
  onEditList: (list: LookupListKey, column: string) => void;
}) {
  const list = column.edit?.list;
  return (
    <th
      scope="col"
      className={`border border-line bg-surface-raised px-3 py-2 text-left font-medium text-ink-muted ${column.edit ? CELL_WIDTH[column.edit.kind] : ""} ${priorityClass[column.priority]}`}
    >
      <div className="flex min-h-10 items-center justify-between gap-1">
        <span>{column.header}</span>
        {list && canEditLists ? (
          <IconButton
            label={messages.lookupLists.edit(column.header)}
            onClick={() => onEditList(list, column.header)}
          >
            <path d="M4 6l4 4 4-4" />
          </IconButton>
        ) : null}
      </div>
    </th>
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
