import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import { outcomeOf, type UndoStep } from "./history";

/** The key a step names its record by: the module's key and the record's id. */
export const recordKey = (moduleKey: string, id: string | number) => `${moduleKey}:${id}`;

/**
 * The record each of this user's own saves returned, by record key. A step writes with the version
 * kept here, never one read from a refresh, so another user's change since makes the save stale
 * instead of being overwritten.
 */
export class VersionBook {
  private readonly records = new Map<string, object>();

  latest<T>(key: string, fallback: T): T {
    const record = this.records.get(key);
    return record ? ({ ...(fallback as object), ...record } as T) : fallback;
  }

  wrote(key: string, record: unknown): void {
    if (record && typeof record === "object") this.records.set(key, record);
  }
}

type Value = string | string[];
type Values = Record<string, Value>;

const sameValue = (a: Value | undefined, b: Value | undefined) =>
  JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

export interface EditStepInput<Row> {
  label: string;
  key: string;
  /** The row as the change found it. */
  row: Row;
  /** What the change's save returned: the record with its new version. */
  saved: Partial<Row> | null | undefined;
  /** The form values the change replaced, and the values it saved. */
  before: Values;
  after: Values;
  book: VersionBook;
  /**
   * The row's values for the changed fields. A step whose fields no longer hold what it left is
   * stale: someone changed them since, and Undo never writes over that.
   */
  current: (row: Row) => Values;
  /** Saves `values` over the row through the module's own update action. */
  write: (row: Row, values: Values) => Promise<ActionResult<Partial<Row>>>;
  /** Shows the row a step saved, until the refresh brings it. */
  onSaved?: (row: Row) => void;
}

/** An edit taken back by saving the earlier values, and made again by saving the new ones. */
export function editStep<Row>(input: EditStepInput<Row>): UndoStep {
  const { key, book } = input;
  book.wrote(key, { ...input.row, ...input.saved });
  const run = async (values: Values, expected: Values) => {
    const row = book.latest(key, input.row);
    const now = input.current(row);
    if (Object.keys(expected).some((field) => !sameValue(now[field], expected[field]))) {
      return "stale";
    }
    const result = await input.write(row, values);
    if (result.ok) {
      const next = { ...row, ...result.data } as Row;
      book.wrote(key, next);
      input.onSaved?.(next);
    }
    return outcomeOf(result);
  };
  return {
    label: input.label,
    targets: () => [key],
    undo: () => run(input.before, input.after),
    redo: () => run(input.after, input.before),
  };
}

export interface CreateStepInput<Created extends object> {
  label: string;
  created: Created;
  keyOf: (record: Created) => string;
  book: VersionBook;
  /** Deletes the record through the module's own delete action. */
  remove: (record: Created) => Promise<ActionResult<unknown>>;
  /** Adds the record again with the values it was added with. */
  add: () => Promise<ActionResult<unknown>>;
}

/** A new record taken back by deleting it, and made again by adding it anew. */
export function createStep<Created extends object>(input: CreateStepInput<Created>): UndoStep {
  const { book, keyOf } = input;
  let current = input.created;
  book.wrote(keyOf(current), current);
  return {
    label: input.label,
    targets: () => [keyOf(current)],
    undo: async () => outcomeOf(await input.remove(book.latest(keyOf(current), current))),
    redo: async () => {
      const result = await input.add();
      if (result.ok && result.data && typeof result.data === "object") {
        current = result.data as Created;
        book.wrote(keyOf(current), current);
      }
      return outcomeOf(result);
    },
  };
}

/** The form field that carries a record's version: never a change of its own. */
const VERSION_FIELD = "rowVer";

const pick = (values: Values, fields: readonly string[]): Values =>
  Object.fromEntries(fields.map((field) => [field, values[field] ?? ""]));

export interface FormEditStepInput<Rec> {
  label: string;
  key: string;
  /** The record as the sheet opened it, and as its save returned it. */
  before: Rec;
  saved: Rec;
  /** The record as its form's values: what the module's update action takes. */
  toFormValues: (record: Rec) => Values;
  update: (values: Values) => Promise<ActionResult<Rec>>;
  book: VersionBook;
}

/**
 * A record sheet's save as one step: the fields it changed go back together. Null when the save
 * changed nothing.
 */
export function formEditStep<Rec>(input: FormEditStepInput<Rec>): UndoStep | null {
  const was = input.toFormValues(input.before);
  const now = input.toFormValues(input.saved);
  const fields = Object.keys(now).filter(
    (field) => field !== VERSION_FIELD && !sameValue(was[field], now[field]),
  );
  if (fields.length === 0) return null;
  return editStep<Rec>({
    label: input.label,
    key: input.key,
    row: input.before,
    saved: input.saved as Partial<Rec>,
    before: pick(was, fields),
    after: pick(now, fields),
    book: input.book,
    current: (record) => pick(input.toFormValues(record), fields),
    write: (latest, values) =>
      input.update({ ...input.toFormValues(latest), ...values }) as Promise<
        ActionResult<Partial<Rec>>
      >,
  });
}

const NAME_LENGTH = 40;

/** A record's name as a step's label: tags dropped, one line, cut short. */
export function stepName(text: string | null | undefined): string {
  const plain = (text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return messages.app.untitled;
  return plain.length > NAME_LENGTH ? `${plain.slice(0, NAME_LENGTH - 1)}…` : plain;
}

export interface SheetUndoInput<Rec extends object> {
  moduleKey: string;
  idOf: (record: Rec) => string | number;
  /** The record's name, plain or rich text: what the step is called. */
  nameOf: (record: Rec) => string | null | undefined;
  /** The record as the sheet opened it; null for a new one. */
  before: Rec | null;
  toFormValues: (record: Rec) => Values;
  update: (values: Values) => Promise<ActionResult<Rec>>;
  /** Adds the record again from the form the sheet sent. */
  create: (data: FormData) => Promise<ActionResult<unknown>>;
  remove: (record: Rec) => Promise<ActionResult<unknown>>;
}

/** A record sheet's save as a step: an edit goes back field by field, a new record is deleted. */
export function sheetUndo<Rec extends object>(input: SheetUndoInput<Rec>) {
  return (saved: unknown, data: FormData, book: VersionBook): UndoStep | null => {
    const record = saved as Rec;
    const keyOf = (r: Rec) => recordKey(input.moduleKey, input.idOf(r));
    const name = stepName(input.nameOf(record));
    const label = input.before ? messages.pageHistory.changesTo(name) : name;
    return input.before
      ? formEditStep({
          label,
          key: keyOf(input.before),
          before: input.before,
          saved: record,
          toFormValues: input.toFormValues,
          update: input.update,
          book,
        })
      : createStep({
          label,
          created: record,
          keyOf,
          book,
          remove: input.remove,
          add: () => input.create(data),
        });
  };
}
