import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * The kinds of column people can add themselves (ADR-0066): one entry per kind, so a new kind is
 * one entry here plus its slot in the owner's cell table. Pure, so the server actions, the
 * datasheet and the tests share one rule per kind. Every owner (a checklist, a register) keeps its
 * own typed tables; only the kinds and their value rules are shared.
 */
export const COLUMN_KINDS = ["date", "text", "document", "action", "choice"] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

/** The kinds each owner offers; each list equals its owner's migration CHECK (tested). */
export const CHECKLIST_KINDS = [
  "date",
  "text",
  "document",
  "action",
] as const satisfies readonly ColumnKind[];
export const REGISTER_KINDS = [
  "date",
  "text",
  "document",
  "choice",
] as const satisfies readonly ColumnKind[];

/** What an action column's button does. */
export const ACTION_KINDS = ["signoff", "todo"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const TEXT_CELL_MAX = 2000;
export const LINK_CELL_MAX = 2048;
export const COLUMN_NAME_MAX = 80;
export const CHOICE_LABEL_MAX = 80;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1000 && day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d
  );
}

/** A typed address as stored: trimmed; a bare "example.com/page" gets https://. */
export function normaliseWebAddress(input: string): string {
  const value = input.trim();
  if (value === "" || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

/**
 * The one link rule for a document cell: an absolute http or https address with a host, no
 * whitespace or control characters, at most 2,048 characters. The proc checks the same.
 */
export function isWebAddress(value: string): boolean {
  if (value.length > LINK_CELL_MAX || /[\s<>"\u0000-\u001f\u007f]/.test(value)) return false;
  if (!/^https?:\/\/./i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

const M = messages.customColumns;

const emptyToNull = (value: string) => (value === "" ? null : value);

/** A cell's value as the form sends it: a string, "" to empty the cell; null in the result. */
type CellValueSchema = z.ZodType<string | null, string>;

export interface ColumnKindSpec {
  label: string;
  /** What a cell of this kind accepts; "" (or blank) empties it. */
  value: CellValueSchema;
  /** How the datasheet edits it; null when the cell is a button. */
  editor: "date" | "text" | "select" | null;
  maxLength?: number;
}

export const COLUMN_KIND_SPECS: Record<ColumnKind, ColumnKindSpec> = {
  date: {
    label: M.kinds.date,
    value: z
      .string()
      .trim()
      .refine((v) => v === "" || isCalendarDate(v), M.badDate)
      .transform(emptyToNull),
    editor: "date",
  },
  text: {
    label: M.kinds.text,
    value: z.string().trim().max(TEXT_CELL_MAX, M.tooLong(TEXT_CELL_MAX)).transform(emptyToNull),
    editor: "text",
    maxLength: TEXT_CELL_MAX,
  },
  document: {
    label: M.kinds.document,
    value: z
      .string()
      .transform(normaliseWebAddress)
      .refine((v) => v === "" || isWebAddress(v), M.badLink)
      .transform(emptyToNull),
    editor: "text",
    maxLength: LINK_CELL_MAX,
  },
  action: {
    label: M.kinds.action,
    value: z
      .string()
      .trim()
      .refine((v) => v === "" || v === "1", M.badSignOff)
      .transform(emptyToNull),
    editor: null,
  },
  choice: {
    label: M.kinds.choice,
    value: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[1-9]\d{0,9}$/.test(v), M.badChoice)
      .transform(emptyToNull),
    editor: "select",
  },
};

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  signoff: M.actions.signoff,
  todo: M.actions.todo,
};

/** A column someone added, as its owner stores it. */
export interface CustomColumnDef {
  id: number;
  name: string;
  kind: ColumnKind;
  actionKind: ActionKind | null;
  /** A choice column's options, in their order. */
  options?: readonly ChoiceOption[];
}

/** One filled cell: only the slot its column's kind uses is present. */
export interface CustomCellValue {
  text?: string;
  date?: string;
  link?: string;
  signedAt?: string;
  signedBy?: string;
  todoId?: number;
  /** A choice cell: the option's id, which a rename never changes. */
  optionId?: number;
}

/** One option of a choice column. */
export interface ChoiceOption {
  id: number;
  label: string;
}

/** The datasheet field a custom column's cell edits: "cell:<column id>". */
export function customCellField(columnId: number): string {
  return `cell:${columnId}`;
}

/** The column id a datasheet field names, or null for a built-in field. */
export function customCellColumnId(field: string): number | null {
  const match = /^cell:(\d+)$/.exec(field);
  return match ? Number(match[1]) : null;
}

/** A cell's value as its editor shows it ("" when empty). */
export function cellInputValue(kind: ColumnKind, cell: CustomCellValue | undefined): string {
  if (!cell) return "";
  if (kind === "date") return cell.date ?? "";
  if (kind === "document") return cell.link ?? "";
  if (kind === "text") return cell.text ?? "";
  if (kind === "choice") return cell.optionId ? String(cell.optionId) : "";
  return cell.signedAt ? "1" : "";
}

export const columnKindSchema = z.enum(COLUMN_KINDS);
export const actionKindSchema = z.enum(ACTION_KINDS);

/** A column name: trimmed, 1 to 80 characters. Rendered as text only, never as HTML. */
export const columnNameSchema = z
  .string()
  .trim()
  .min(1, M.nameRequired)
  .max(COLUMN_NAME_MAX, M.tooLong(COLUMN_NAME_MAX));

/** A new column of one of `kinds`: a name, a kind, and for an action column what its button does. */
export function newColumnSchemaFor(kinds: readonly ColumnKind[]) {
  return newColumnSchema.refine((c) => kinds.includes(c.kind), {
    message: M.badKind,
    path: ["kind"],
  });
}

/** A new column: a name, a kind, and for an action column what its button does. */
export const newColumnSchema = z
  .object({
    name: columnNameSchema,
    kind: columnKindSchema,
    actionKind: z.preprocess((v) => (v === "" ? undefined : v), actionKindSchema.optional()),
  })
  .refine((c) => (c.kind === "action") === (c.actionKind !== undefined), {
    message: M.actionRequired,
    path: ["actionKind"],
  });

export type NewColumn = z.infer<typeof newColumnSchema>;

/** The value a cell of `kind` stores for `input`, or the reason it cannot. */
export function parseCellValue(
  kind: ColumnKind,
  input: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const parsed = COLUMN_KIND_SPECS[kind].value.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? M.badValue };
}
