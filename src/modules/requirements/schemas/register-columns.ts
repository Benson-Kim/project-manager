import { z } from "zod";
import {
  CHOICE_LABEL_MAX,
  REGISTER_KINDS,
  columnNameSchema,
  parseCellValue,
} from "@/lib/custom-columns/kinds";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * The requirement register's own column names and added columns, per project (ADR-0067). A
 * built-in column is named by its stable key; a rename writes only a label, never the key, so data,
 * filters, sorting, saved views and exports keep working. Added columns use the shared kinds
 * (ADR-0066) plus a choice list, and their values are keyed by the column's id.
 */

const M = messages.requirements;

/** The register's built-in columns: stable key and default name. One list for the view and the procs. */
export const REGISTER_BUILT_IN_COLUMNS = [
  { key: "Ref", name: M.ref },
  { key: "RequirementType", name: M.type },
  { key: "Requirement", name: M.requirement },
  { key: "IsMet", name: M.met },
  { key: "Deliverables", name: M.deliverables },
  { key: "Validates", name: M.validates },
  { key: "ValidatedBy", name: M.validatedBy },
  { key: "Coverage", name: M.coverage },
  { key: "CreatedAtUtc", name: M.addedAt },
  { key: "AddSub", name: M.addSubRequirement },
] as const;

export type BuiltInColumnKey = (typeof REGISTER_BUILT_IN_COLUMNS)[number]["key"];
const BUILT_IN_KEYS = REGISTER_BUILT_IN_COLUMNS.map((c) => c.key) as [
  BuiltInColumnKey,
  ...BuiltInColumnKey[],
];

/** What the procs check a new name against, as JSON. Built here, on the server, never sent by a browser. */
export const BUILT_IN_COLUMNS_JSON = JSON.stringify(REGISTER_BUILT_IN_COLUMNS);

export const MAX_REGISTER_COLUMNS = 5;
export const MAX_CHOICES = 50;

const idSchema = z.coerce.number().int().positive();

export const columnLabelSchema = z.object({
  ColumnKey: z.string(),
  Label: z.string(),
  RowVer: rowVerSchema,
});
export type ColumnLabel = z.infer<typeof columnLabelSchema>;

const optionSchema = z.object({ id: z.number().int(), label: z.string(), rowVer: rowVerSchema });
export type RegisterOption = z.infer<typeof optionSchema>;

export const registerColumnSchema = z
  .object({
    RequirementColumnId: z.number().int(),
    Name: z.string(),
    Kind: z.enum(REGISTER_KINDS),
    SortOrder: z.number().int(),
    RowVer: rowVerSchema,
    HasValues: z.boolean().optional(),
    OptionsJson: z.string().nullable().optional(),
  })
  .transform(({ OptionsJson, ...column }) => ({
    ...column,
    HasValues: column.HasValues ?? false,
    Options: OptionsJson ? z.array(optionSchema).parse(JSON.parse(OptionsJson)) : [],
  }));
export type RegisterColumn = z.output<typeof registerColumnSchema>;

const registerCellSchema = z.object({
  columnId: z.number().int(),
  text: z.string().optional(),
  date: z.string().optional(),
  link: z.string().optional(),
  optionId: z.number().int().optional(),
});
export type RegisterCell = z.infer<typeof registerCellSchema>;

/** A row's added-column values, as ufn_Requirement_CustomCells writes them. */
export const registerCellsSchema = z
  .string()
  .nullable()
  .optional()
  .transform((json) => (json ? z.array(registerCellSchema).parse(JSON.parse(json)) : []));

export const registerCellResultSchema = z
  .object({
    RequirementId: z.number().int(),
    RowVer: rowVerSchema,
    CustomCellsJson: registerCellsSchema,
  })
  .transform(({ CustomCellsJson, ...row }) => ({ ...row, CustomCells: CustomCellsJson }));
export type RegisterCellResult = z.output<typeof registerCellResultSchema>;

/** The register's choice filter in the URL: "cf=<column id>.<choice id>"; ids, never names. */
export function parseChoiceFilter(
  value: string | undefined,
): { columnId: number; optionId: number } | null {
  const match = /^(\d{1,9})\.(\d{1,9})$/.exec(value ?? "");
  return match ? { columnId: Number(match[1]), optionId: Number(match[2]) } : null;
}

export const choiceFilterParam = (columnId: number, optionId: number) => `${columnId}.${optionId}`;

const choicesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(CHOICE_LABEL_MAX, messages.customColumns.tooLong(CHOICE_LABEL_MAX)),
  )
  .min(1, M.columns.choicesRequired)
  .max(MAX_CHOICES)
  .refine((list) => new Set(list.map((c) => c.toUpperCase())).size === list.length, {
    message: M.columns.choicesUnique,
  });

export const setLabelInput = z.strictObject({
  projectId: idSchema,
  columnKey: z.enum(BUILT_IN_KEYS),
  label: columnNameSchema,
  rowVer: rowVerSchema.nullable(),
});
export type SetLabelInput = z.infer<typeof setLabelInput>;

export const clearLabelInput = z.strictObject({
  projectId: idSchema,
  columnKey: z.enum(BUILT_IN_KEYS),
  rowVer: rowVerSchema,
});
export type ClearLabelInput = z.infer<typeof clearLabelInput>;

export const createRegisterColumnInput = z
  .strictObject({
    projectId: idSchema,
    name: columnNameSchema,
    kind: z.enum(REGISTER_KINDS),
    choices: z.array(z.string()).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind !== "choice") {
      if (input.choices?.length)
        ctx.addIssue({ code: "custom", message: M.columns.onlyChoices, path: ["choices"] });
      return;
    }
    const checked = choicesSchema.safeParse(input.choices ?? []);
    if (!checked.success)
      ctx.addIssue({
        code: "custom",
        message: checked.error.issues[0]!.message,
        path: ["choices"],
      });
  });
export type CreateRegisterColumnInput = z.infer<typeof createRegisterColumnInput>;

export const renameRegisterColumnInput = z.strictObject({
  columnId: idSchema,
  name: columnNameSchema,
  rowVer: rowVerSchema,
});
export type RenameRegisterColumnInput = z.infer<typeof renameRegisterColumnInput>;

export const moveRegisterColumnInput = z.strictObject({
  columnId: idSchema,
  direction: z.union([z.literal(-1), z.literal(1)]),
  rowVer: rowVerSchema,
});
export type MoveRegisterColumnInput = z.infer<typeof moveRegisterColumnInput>;

export const setRegisterColumnKindInput = z
  .strictObject({
    columnId: idSchema,
    kind: z.enum(REGISTER_KINDS),
    choices: z.array(z.string()).optional(),
    rowVer: rowVerSchema,
  })
  .superRefine((input, ctx) => {
    if (input.kind !== "choice") return;
    const checked = choicesSchema.safeParse(input.choices ?? []);
    if (!checked.success)
      ctx.addIssue({
        code: "custom",
        message: checked.error.issues[0]!.message,
        path: ["choices"],
      });
  });
export type SetRegisterColumnKindInput = z.infer<typeof setRegisterColumnKindInput>;

export const deleteRegisterColumnInput = z.strictObject({
  columnId: idSchema,
  rowVer: rowVerSchema,
});
export type DeleteRegisterColumnInput = z.infer<typeof deleteRegisterColumnInput>;

const choiceLabel = z.string().trim().min(1).max(CHOICE_LABEL_MAX);

export const createChoiceInput = z.strictObject({ columnId: idSchema, label: choiceLabel });
export type CreateChoiceInput = z.infer<typeof createChoiceInput>;

export const renameChoiceInput = z.strictObject({
  optionId: idSchema,
  label: choiceLabel,
  rowVer: rowVerSchema,
});
export type RenameChoiceInput = z.infer<typeof renameChoiceInput>;

export const deleteChoiceInput = z.strictObject({ optionId: idSchema, rowVer: rowVerSchema });
export type DeleteChoiceInput = z.infer<typeof deleteChoiceInput>;

/** One added-column cell; the proc reads the column's kind itself and is the rule that holds. */
export const setRegisterCellInput = z
  .strictObject({
    requirementId: idSchema,
    columnId: idSchema,
    kind: z.enum(REGISTER_KINDS),
    value: z.string().max(4000),
    rowVer: rowVerSchema,
  })
  .transform((input, ctx) => {
    const parsed = parseCellValue(input.kind, input.value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message, path: ["value"] });
      return z.NEVER;
    }
    return {
      requirementId: input.requirementId,
      columnId: input.columnId,
      value: parsed.value,
      rowVer: input.rowVer,
    };
  });
export type SetRegisterCellInput = z.input<typeof setRegisterCellInput>;
export type SetRegisterCellParsed = z.output<typeof setRegisterCellInput>;
