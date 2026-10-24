import { formatDate, toDateInput } from "@/lib/format";
import type { ListChoice, LookupListKey } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { ListBadge } from "../lookup-lists";
import { formText, previewText, type RichCellView } from "./datasheet";
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
  /** Rows whose cell can be edited; every row the actor may edit by default. */
  editable?: (row: Row) => boolean;
  /** The proc's `@SortBy` token, when the column key is not it (DataViewColumn.sort). */
  sort?: string;
}

export function textColumn<Row>(
  spec: ColumnSpec<Row, string | null> & { maxLength?: number },
): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    sort: spec.sort,
    render: spec.render ?? spec.value,
    edit: {
      kind: "text",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      placeholder: spec.placeholder,
      maxLength: spec.maxLength,
      multiline: spec.maxLength === undefined || spec.maxLength > 255,
      editable: spec.editable,
    },
  };
}

/**
 * A rich-text column (ADR-0023 amendment, ADR-0025). The cell shows the
 * formatted text clamped to the row height; Enter, F2 or a click opens the
 * shared editor in a panel under the cell, Shift+F2 the larger editor (like
 * Access's Zoom box). `view` is the server-rendered RichTextView of the
 * stored HTML, since the sanitiser never ships to the browser; while it is
 * stale after a save the cell shows the new text plainly until the refresh.
 */
export function richTextColumn<Row>(
  spec: ColumnSpec<Row, string | null> & { view: (row: Row) => RichCellView },
): DataViewColumn<Row> {
  const display = (row: Row) => {
    const view = spec.view(row);
    const html = spec.value(row);
    return view.html === html ? view.node : previewText(html);
  };
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    sort: spec.sort,
    render: spec.render ?? display,
    edit: {
      kind: "rich",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      placeholder: spec.placeholder,
      display,
      editable: spec.editable,
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
    sort: spec.sort,
    render: spec.render ?? spec.value,
    edit: {
      kind: "number",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      placeholder: spec.placeholder,
      min: spec.min,
      max: spec.max,
      editable: spec.editable,
    },
  };
}

export function dateColumn<Row>(spec: ColumnSpec<Row, Date | null>): DataViewColumn<Row> {
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    sort: spec.sort,
    render: spec.render ?? ((row) => formatDate(spec.value(row))),
    edit: {
      kind: "date",
      field: spec.field,
      value: (row) => toDateInput(spec.value(row)),
      placeholder: spec.placeholder,
      editable: spec.editable,
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
    sort: spec.sort,
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
      editable: spec.editable,
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
    /** false: every record has a value, so the select offers no empty choice. */
    clearable?: boolean;
    /** The new-entry row's starting value (a label of the list). */
    initial?: string;
  },
): DataViewColumn<Row> {
  const label = spec.currentLabel ?? ((row: Row) => formText(spec.value(row)) || null);
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    sort: spec.sort,
    // The value's badge in its list colour (migration 020).
    render:
      spec.render ??
      ((row) => (
        <ListBadge list={spec.list} value={formText(spec.value(row)) || null} label={label(row)} />
      )),
    edit: {
      kind: "select",
      field: spec.field,
      list: spec.list,
      value: (row) => formText(spec.value(row)),
      currentLabel: spec.currentLabel,
      placeholder: spec.placeholder,
      clearable: spec.clearable,
      initial: spec.initial,
      editable: spec.editable,
    },
  };
}

/**
 * A select of the module's own choices (not a managed list), e.g. a record's
 * own categories. `editList`, given when the viewer may edit those choices,
 * ends the select with "Edit list…" and gives the header its caret, as a
 * managed list's column does. Rows keep showing a value that left the choices.
 */
export function choiceColumn<Row>(
  spec: ColumnSpec<Row, string | null> & {
    choices: readonly ListChoice[];
    /** What the empty choice reads in data rows; "None" by default. */
    emptyLabel?: string;
    clearable?: boolean;
    initial?: string;
    editList?: () => void;
  },
): DataViewColumn<Row> {
  const label = (row: Row) => {
    const value = formText(spec.value(row));
    return value
      ? (spec.choices.find((choice) => choice.value === value)?.label ?? value)
      : (spec.emptyLabel ?? messages.datasheet.noValue);
  };
  return {
    key: spec.key,
    header: spec.header,
    priority: spec.priority,
    sort: spec.sort,
    render: spec.render ?? label,
    edit: {
      kind: "select",
      field: spec.field,
      value: (row) => formText(spec.value(row)),
      currentLabel: (row) => label(row),
      choices: spec.choices,
      clearable: spec.clearable,
      emptyLabel: spec.emptyLabel,
      initial: spec.initial,
      placeholder: spec.placeholder,
      editList: spec.editList,
      editable: spec.editable,
    },
  };
}

/**
 * The Project column of a cross-project list (/daily-activities, /todo): the
 * project's name, and a select of the projects the actor may put the record in
 * (`choices`); the empty choice is the project-less shared space, offered when
 * `clearable`. Rows keep showing a current project that isn't among the choices.
 */
export function projectColumn<
  Row extends { ProjectId: number | null; ProjectName: string | null },
>(spec: {
  priority: 1 | 2 | 3;
  choices: readonly ListChoice[];
  clearable: boolean;
  /** The new-entry row's project (the filtered one), "" for none. */
  initial?: string;
}): DataViewColumn<Row> {
  return {
    key: "Project",
    header: messages.projectPicker.header,
    priority: spec.priority,
    render: (row) => row.ProjectName ?? messages.projectPicker.none,
    edit: {
      kind: "select",
      field: "projectId",
      value: (row) => formText(row.ProjectId),
      currentLabel: (row) => row.ProjectName,
      choices: spec.choices,
      clearable: spec.clearable,
      emptyLabel: messages.projectPicker.none,
      initial: spec.initial,
      placeholder: messages.projectPicker.placeholder,
    },
  };
}
