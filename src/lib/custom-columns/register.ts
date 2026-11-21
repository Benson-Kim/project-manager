import { z } from "zod";
import { messages } from "@/lib/messages";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { CHOICE_LABEL_MAX, REGISTER_KINDS, columnNameSchema, parseCellValue } from "./kinds";

/**
 * A list's own column names and added columns, per project. The same procs exist per list
 * (usp_<Entity>Label_*, usp_<Entity>Column_*, usp_<Entity>ColumnOption_*, usp_<Entity>Cell_Set);
 * the entity comes only from this allowlist, never from a request. Each proc checks access and
 * audits; the built-in columns' keys and default names go to them from the list's one definition.
 */
export const CUSTOM_COLUMN_ENTITIES = ["Requirement", "DailyActivity", "TodoItem"] as const;
export type CustomColumnEntity = (typeof CUSTOM_COLUMN_ENTITIES)[number];
export type BuiltInColumn = { readonly key: string; readonly name: string };

export const MAX_REGISTER_COLUMNS = 5;
export const MAX_CHOICES = 50;

const M = messages.requirements.columns;
const idSchema = z.coerce.number().int().positive();

export const columnLabelSchema = z.object({
  ColumnKey: z.string(),
  Label: z.string(),
  RowVer: rowVerSchema,
});
export type ColumnLabel = z.infer<typeof columnLabelSchema>;

const optionSchema = z.object({ id: z.number().int(), label: z.string(), rowVer: rowVerSchema });
export type RegisterOption = z.infer<typeof optionSchema>;

const renameKey = (key: string, to: string) => (row: unknown) =>
  row && typeof row === "object" ? { ...row, [to]: (row as Record<string, unknown>)[key] } : row;

const columnShape = z
  .object({
    ColumnId: z.number().int(),
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
export type RegisterColumn = z.output<typeof columnShape>;

export const columnSchemaFor = (entity: CustomColumnEntity) =>
  z.preprocess(renameKey(`${entity}ColumnId`, "ColumnId"), columnShape);

const registerCellSchema = z.object({
  columnId: z.number().int(),
  text: z.string().optional(),
  date: z.string().optional(),
  link: z.string().optional(),
  optionId: z.number().int().optional(),
});
export type RegisterCell = z.infer<typeof registerCellSchema>;

/** A row's added-column values, as ufn_<Entity>_CustomCells writes them. */
export const registerCellsSchema = z
  .string()
  .nullable()
  .optional()
  .transform((json) => (json ? z.array(registerCellSchema).parse(JSON.parse(json)) : []));

/** What a cell write answers: the row's new version and its added cells, to merge into the row shown. */
export const registerCellResultSchema = z
  .object({ RowVer: rowVerSchema, CustomCellsJson: registerCellsSchema })
  .transform(({ RowVer, CustomCellsJson }) => ({ RowVer, CustomCells: CustomCellsJson }));
export type RegisterCellResult = z.output<typeof registerCellResultSchema>;

const choicesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(CHOICE_LABEL_MAX, messages.customColumns.tooLong(CHOICE_LABEL_MAX)),
  )
  .min(1, M.choicesRequired)
  .max(MAX_CHOICES)
  .refine((list) => new Set(list.map((c) => c.toUpperCase())).size === list.length, {
    message: M.choicesUnique,
  });

const checkChoices = (choices: string[] | undefined, ctx: z.RefinementCtx) => {
  const checked = choicesSchema.safeParse(choices ?? []);
  if (!checked.success)
    ctx.addIssue({ code: "custom", message: checked.error.issues[0]!.message, path: ["choices"] });
};

export const labelInputsFor = <const T extends readonly BuiltInColumn[]>(builtIns: T) => {
  const keys = builtIns.map((c) => c.key) as [T[number]["key"], ...T[number]["key"][]];
  return {
    set: z.strictObject({
      projectId: idSchema,
      columnKey: z.enum(keys),
      label: columnNameSchema,
      rowVer: rowVerSchema.nullable(),
    }),
    clear: z.strictObject({ projectId: idSchema, columnKey: z.enum(keys), rowVer: rowVerSchema }),
  };
};
type LabelInputs = ReturnType<typeof labelInputsFor>;
export type SetLabelInput = z.infer<LabelInputs["set"]>;
export type ClearLabelInput = z.infer<LabelInputs["clear"]>;

export const createRegisterColumnInput = z
  .strictObject({
    projectId: idSchema,
    name: columnNameSchema,
    kind: z.enum(REGISTER_KINDS),
    choices: z.array(z.string()).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "choice") return checkChoices(input.choices, ctx);
    if (input.choices?.length)
      ctx.addIssue({ code: "custom", message: M.onlyChoices, path: ["choices"] });
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
    if (input.kind === "choice") checkChoices(input.choices, ctx);
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
    rowId: idSchema,
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
    return { rowId: input.rowId, columnId: input.columnId, value: parsed.value, rowVer: input.rowVer };
  });
export type SetRegisterCellInput = z.input<typeof setRegisterCellInput>;
export type SetRegisterCellParsed = z.output<typeof setRegisterCellInput>;

