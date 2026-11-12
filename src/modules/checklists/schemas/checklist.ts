import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import {
  ACTION_KINDS,
  CHECKLIST_KINDS,
  COLUMN_NAME_MAX,
  newColumnSchemaFor,
  parseCellValue,
} from "@/lib/custom-columns/kinds";
import type { ListSort } from "@/lib/list-params";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/** Checklists (ADR-0066): rows are read and written through the procs only. */

export const CHECKLIST_NAME_MAX = 120;
export const ITEM_TITLE_MAX = 400;

/** Rows keep their own order; the header offers the title as the one sortable column. */
export const CHECKLIST_ITEM_SORT: ListSort = { columns: ["Title"], default: null };

const idSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1).max(CHECKLIST_NAME_MAX);
const titleSchema = z.string().trim().min(1).max(ITEM_TITLE_MAX);

export const checklistSchema = z.object({
  ChecklistId: z.number().int(),
  ProjectId: z.number().int(),
  Name: z.string(),
  RowVer: rowVerSchema,
});
export type Checklist = z.infer<typeof checklistSchema>;

export const checklistColumnSchema = z.object({
  ChecklistColumnId: z.number().int(),
  ChecklistId: z.number().int(),
  Name: z.string(),
  Kind: z.enum(CHECKLIST_KINDS),
  ActionKind: z.enum(ACTION_KINDS).nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});
export type ChecklistColumn = z.infer<typeof checklistColumnSchema>;

/** One filled cell, as ufn_ChecklistItem_Row writes it: only the slot its kind uses is present. */
export const checklistCellSchema = z.object({
  columnId: z.number().int(),
  text: z.string().optional(),
  date: z.string().optional(),
  link: z.string().optional(),
  signedAt: z.string().optional(),
  signedBy: z.string().optional(),
  todoId: z.number().int().optional(),
});
export type ChecklistCell = z.infer<typeof checklistCellSchema>;

const cellsSchema = z
  .string()
  .nullable()
  .transform((json) => (json ? z.array(checklistCellSchema).parse(JSON.parse(json)) : []));

const dateTime = z.union([z.date(), z.string()]).transform((v) => new Date(v).toISOString());

/** One row of usp_ChecklistItem_List, and what every row write answers with. */
export const checklistItemSchema = z.object({
  ChecklistItemId: z.number().int(),
  ChecklistId: z.number().int(),
  ProjectId: z.number().int(),
  Title: z.string(),
  IsDone: z.boolean(),
  DoneAtUtc: dateTime.nullable(),
  DoneByName: z.string().nullable(),
  SortOrder: z.number().int(),
  CreatedAtUtc: dateTime,
  RowVer: rowVerSchema,
  ...actorAccessFields,
  Cells: cellsSchema,
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistItemListRowSchema = checklistItemSchema.extend({
  TotalCount: z.number().int(),
});
export type ChecklistItemListRow = z.infer<typeof checklistItemListRowSchema>;

export const createChecklistInput = z.strictObject({ projectId: idSchema, name: nameSchema });
export type CreateChecklistInput = z.infer<typeof createChecklistInput>;

export const renameChecklistInput = z.strictObject({
  checklistId: idSchema,
  name: nameSchema,
  rowVer: rowVerSchema,
});
export type RenameChecklistInput = z.infer<typeof renameChecklistInput>;

export const deleteChecklistInput = z.strictObject({
  checklistId: idSchema,
  rowVer: rowVerSchema,
});
export type DeleteChecklistInput = z.infer<typeof deleteChecklistInput>;

export const createColumnInput = z
  .strictObject({
    checklistId: idSchema,
    name: z.string(),
    kind: z.string(),
    actionKind: z.string().optional(),
  })
  .transform((input, ctx) => {
    const column = newColumnSchemaFor(CHECKLIST_KINDS).safeParse(input);
    if (!column.success) {
      for (const issue of column.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      return z.NEVER;
    }
    return { checklistId: input.checklistId, ...column.data };
  });
export type CreateColumnInput = z.input<typeof createColumnInput>;
export type CreateColumnParsed = z.output<typeof createColumnInput>;

export const renameColumnInput = z.strictObject({
  columnId: idSchema,
  name: z.string().trim().min(1).max(COLUMN_NAME_MAX),
  rowVer: rowVerSchema,
});
export type RenameColumnInput = z.infer<typeof renameColumnInput>;

export const moveColumnInput = z.strictObject({
  columnId: idSchema,
  direction: z.union([z.literal(-1), z.literal(1)]),
  rowVer: rowVerSchema,
});
export type MoveColumnInput = z.infer<typeof moveColumnInput>;

export const deleteColumnInput = z.strictObject({ columnId: idSchema, rowVer: rowVerSchema });
export type DeleteColumnInput = z.infer<typeof deleteColumnInput>;

export const createItemInput = z.strictObject({ checklistId: idSchema, title: titleSchema });
export type CreateItemInput = z.infer<typeof createItemInput>;

export const updateItemInput = z.strictObject({
  itemId: idSchema,
  title: titleSchema,
  rowVer: rowVerSchema,
});
export type UpdateItemInput = z.infer<typeof updateItemInput>;

export const setItemDoneInput = z.strictObject({
  itemId: idSchema,
  done: z.boolean(),
  rowVer: rowVerSchema,
});
export type SetItemDoneInput = z.infer<typeof setItemDoneInput>;

export const deleteItemInput = z.strictObject({ itemId: idSchema, rowVer: rowVerSchema });
export type DeleteItemInput = z.infer<typeof deleteItemInput>;

/**
 * One cell write. The proc reads the column's kind itself and is the rule that holds; the kind
 * named here only lets the shared kind rule answer a typo with a field message first, and tidy
 * the value (a bare "example.com/spec" becomes https://).
 */
export const setCellInput = z
  .strictObject({
    itemId: idSchema,
    columnId: idSchema,
    kind: z.enum(CHECKLIST_KINDS),
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
      itemId: input.itemId,
      columnId: input.columnId,
      value: parsed.value,
      rowVer: input.rowVer,
    };
  });
export type SetCellInput = z.input<typeof setCellInput>;
export type SetCellParsed = z.output<typeof setCellInput>;

export const runTodoInput = z.strictObject({ itemId: idSchema, columnId: idSchema });
export type RunTodoInput = z.infer<typeof runTodoInput>;
