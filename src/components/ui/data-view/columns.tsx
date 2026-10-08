import { formatDate, toDateInput } from "@/lib/format";
import type { LookupListKey } from "@/lib/lookup-lists";
import { Badge } from "../badge";
import { formText } from "./datasheet";
import type { DataViewColumn } from "./types";

/**
 * Datasheet column factories (ADR-0023): one call declares a column's header,
 * how it reads, and how it edits — the form field it sends, the ghost text of
 * the new-entry row and, for list-bound columns, the managed list behind the
 * select and its header caret (ADR-0022). Every list module builds its columns
 * from these, so cells look and behave the same everywhere.
 */
interface ColumnSpec<Row, Value> {
  key: string;
  header: string;
  /** 1 = always visible; 2 = >= sm; 3 = >= lg. */
  priority: 1 | 2 | 3;
  /** The module form schema field the cell edits. */
  field: string;
  value: (row: Row) => Value;
  /** Ghost text of the new-entry row, e.g. "[New requirement…]". */
  placeholder: string;
  /** Read-only rendering (cards use renderCard); defaults per kind. */
  render?: (row: Row) => React.ReactNode;
}

export function textColumn<Row>(
  spec: ColumnSpec<Row, string | null> & { maxLength?: number },
): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    render: spec.render ?? spec.value,
    edit: {
      kind: "text",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      placeholder: spec.placeholder,
      maxLength: spec.maxLength,
    },
  };
}

export function numberColumn<Row>(
  spec: ColumnSpec<Row, number | null> & { min?: number; max?: number },
): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    render: spec.render ?? spec.value,
    edit: {
      kind: "number",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      placeholder: spec.placeholder,
      min: spec.min,
      max: spec.max,
    },
  };
}

export function dateColumn<Row>(spec: ColumnSpec<Row, Date | null>): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    render: spec.render ?? ((row) => formatDate(spec.value(row))),
    edit: {
      kind: "date",
      field: spec.field,
      value: (row) => toDateInput(spec.value(row)),
      placeholder: spec.placeholder,
    },
  };
}

/**
 * A yes/no column: a Yes/No select that sends what the record sheet's checkbox
 * sends ("on" when checked, "" otherwise), so the same form schema parses it.
 */
export function booleanColumn<Row>(
  spec: ColumnSpec<Row, boolean> & { yes: string; no: string },
): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    render: spec.render ?? ((row) => (spec.value(row) ? spec.yes : spec.no)),
    edit: {
      kind: "select",
      field: spec.field,
      value: (row) => (spec.value(row) ? "on" : ""),
      choices: [
        { value: "", label: spec.no },
        { value: "on", label: spec.yes },
      ],
      clearable: false,
      placeholder: spec.placeholder,
    },
  };
}

/**
 * A column bound to a managed list: a select of the list's live options, the
 * header caret that edits the list, a badge when read-only. Id-bound lists pass
 * the option id as `value` and its label as `currentLabel`.
 */
export function listColumn<Row>(
  spec: ColumnSpec<Row, string | number | null> & {
    list: LookupListKey;
    currentLabel?: (row: Row) => string | null;
  },
): DataViewColumn<Row> {
  const label = spec.currentLabel ?? ((row: Row) => formText(spec.value(row)) || null);
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    render: spec.render ?? ((row) => <Badge value={label(row)} />),
    edit: {
      kind: "select",
      field: spec.field,
      list: spec.list,
      value: (row) => formText(spec.value(row)),
      currentLabel: spec.currentLabel,
      placeholder: spec.placeholder,
    },
  };
}
