import type { ActionResult } from "@/lib/action";
import {
  ID_BOUND_LISTS,
  listChoices,
  type ListChoice,
  type LookupListKey,
  type LookupLists,
} from "@/lib/lookup-lists";

/**
 * Datasheet mode of the DataView (ADR-0023, client feedback §2–4): in list
 * view, editable cells are inputs (Access-style), a persistent "new entry" row
 * sits under the data, and list-bound columns get a header caret that opens
 * the dropdown-list editor (ADR-0022). Pure, DOM-free helpers live here so
 * Vitest covers them (ADR-0013); the components only render.
 */

export type CellKind = "text" | "number" | "date" | "select";

/**
 * How a column edits. A cell edits ONE field of the module's form schema, as a
 * string — exactly what the record sheet's FormData sends — so the datasheet
 * and the sheet share the same Server Action and validation.
 */
export interface CellEditor<Row> {
  kind: CellKind;
  /** The form field name (key of the module's form schema). */
  field: string;
  /** The row's value as the input's string: dates "YYYY-MM-DD", ids as digits, "" when empty. */
  value: (row: Row) => string;
  /** Ghost text of the new-entry row (client feedback: "[New project name…]"). */
  placeholder: string;
  /** Managed list behind a select: its options, and the header caret that edits it. */
  list?: LookupListKey;
  /** Label of the row's current value, for id-bound lists whose option was retired. */
  currentLabel?: (row: Row) => string | null;
  /** Fixed choices for a select that isn't a managed list (e.g. a project picker). */
  choices?: readonly ListChoice[];
  /** Whether the select offers an empty choice ("None"). Defaults to true. */
  clearable?: boolean;
  /** What the empty choice of a clearable select reads in data rows; "None" by default. */
  emptyLabel?: string;
  /** The new-entry row's starting value (e.g. the filtered project); "" by default. */
  initial?: string;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface DatasheetConfig<Row> {
  /** Whether the viewer may edit this row — from the row's ActorAccess (ADR-0023). */
  canEditRow: (row: Row) => boolean;
  /**
   * Saves one cell: the module sends the row's form values with `field`
   * replaced to its update action. The returned record (new RowVer) is merged
   * into the row so the next edit doesn't conflict before the page refreshes.
   */
  saveCell: (row: Row, field: string, value: string) => Promise<ActionResult<Partial<Row>>>;
  /** The new-entry row; omitted when the viewer can't create here. */
  addRow?: {
    add: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
  };
}

/** Form values as the record sheet's FormData would send them. */
export type FormValues = Record<string, string | string[]>;

/** A row value as a form string: "" for null, digits for numbers. */
export function formText(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * The saveCell every module uses: the row's current form values with one field
 * replaced, sent to the module's update Server Action — the same schema,
 * permission, proc and audit as saving the record sheet. The returned record
 * carries the new RowVer.
 */
export function formCellSaver<Row, Result>(
  toFormValues: (row: Row) => FormValues,
  update: (input: FormValues) => Promise<ActionResult<Result>>,
): DatasheetConfig<Row>["saveCell"] {
  return async (row, field, value) => {
    const result = await update({ ...toFormValues(row), [field]: value });
    return result.ok ? { ok: true, data: result.data as Partial<Row> } : result;
  };
}

/** Key events that belong to a form control, not to the list's row navigation. */
export function isEditableTarget(target: { tagName?: string } | null | undefined): boolean {
  const tag = target?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON";
}

/** The choices a select cell offers, keeping the row's current value visible when it left the list. */
export function cellChoices<Row>(
  editor: CellEditor<Row>,
  lists: LookupLists,
  current?: { value: string; label: string | null },
): ListChoice[] {
  if (editor.list) {
    return listChoices(lists[editor.list], ID_BOUND_LISTS.includes(editor.list), current);
  }
  const choices = [...(editor.choices ?? [])];
  if (current?.value && !choices.some((choice) => choice.value === current.value)) {
    choices.push({ value: current.value, label: current.label ?? current.value });
  }
  return choices;
}

/** Whether a committed value differs from the row's (text compares trimmed, like the form schemas). */
export function isCellChanged(kind: CellKind, original: string, next: string): boolean {
  return kind === "text" ? original.trim() !== next.trim() : original !== next;
}

/** A fresh new-entry draft for the editable columns, keyed by form field (starting values or ""). */
export function emptyDraft<Row>(editors: readonly CellEditor<Row>[]): Record<string, string> {
  return Object.fromEntries(editors.map((editor) => [editor.field, editor.initial ?? ""]));
}

/**
 * Whether the new-entry row holds anything worth committing: a value typed
 * beyond the fresh draft (`base`) — a preset project alone is not an entry.
 */
export function hasDraft(
  draft: Record<string, string>,
  base: Record<string, string> = {},
): boolean {
  return Object.entries(draft).some(
    ([field, value]) => value.trim() !== "" && value !== (base[field] ?? ""),
  );
}

/** The fields an action rejected, from ActionResult.error.fieldErrors keys. */
export function invalidFields(fieldErrors: Record<string, string[]> | undefined): Set<string> {
  return new Set(Object.keys(fieldErrors ?? {}));
}

/** Row height until the user drags a row edge (client feedback §2: spacious rows). */
export const DEFAULT_ROW_HEIGHT = 48;

/** Minimum width per kind so cells stay readable (client feedback §2: spacious cells). */
export const CELL_WIDTH: Record<CellKind, string> = {
  text: "min-w-56",
  number: "min-w-28",
  date: "min-w-40",
  select: "min-w-44",
};

/** CELL_WIDTH in px: what a column's resize handle reports before the browser measures it. */
export const CELL_WIDTH_PX: Record<CellKind, number> = {
  text: 224,
  number: 112,
  date: 160,
  select: 176,
};
