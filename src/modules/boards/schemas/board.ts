import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { BOARD_COLUMN_NAME_MAX, COLUMN_CATEGORIES, MAX_BOARD_COLUMNS } from "./board-rules";

/**
 * Board (app.Board) — zod contracts. The row schemas mirror the SELECT shape of
 * usp_Board_{Create,GetById,List,ListOptions,Update}. Every input is an explicit
 * allow-list, so a payload can never carry a field the proc does not take:
 * BoardId, ProjectId, CreatedBy and RowVer are the server's to set, and linking
 * a board to a project is its own intention, not a field on an update.
 */

export const boardRowSchema = z.object({
  BoardId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  Name: z.string(),
  Description: z.string().nullable(),
  CreatedBy: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type BoardRow = z.infer<typeof boardRowSchema>;

/** usp_Board_List: the row plus the project's name, the page total and the actor's standing. */
export const boardListRowSchema = boardRowSchema.extend({
  ProjectName: z.string().nullable(),
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type BoardListRow = z.infer<typeof boardListRowSchema>;

/** usp_Board_GetById: one board with the actor's standing on it. */
export const boardDetailRowSchema = boardRowSchema.extend({
  ProjectName: z.string().nullable(),
  ...actorAccessFields,
});

export type BoardDetailRow = z.infer<typeof boardDetailRowSchema>;

/** usp_Board_Create: the new row with the actor's level. A create carries no overrides. */
export const boardCreatedRowSchema = boardRowSchema.extend({
  ProjectName: z.string().nullable(),
  ActorAccess: actorAccessFields.ActorAccess,
});

/** usp_Board_ListOptions: the picker's rows. */
export const boardOptionRowSchema = z.object({
  BoardId: z.number().int(),
  Name: z.string(),
  ProjectId: z.number().int().nullable(),
  ProjectName: z.string().nullable(),
  ActorAccess: actorAccessFields.ActorAccess,
});

export type BoardOptionRow = z.infer<typeof boardOptionRowSchema>;

const boardName = z.string().trim().min(1).max(200);
const boardDescription = z.string().trim().max(2000).nullish();

/** One starting column of a new board (usp_Board_Create @ColumnsJson). */
export const boardColumnDraftInput = z.object({
  name: z.string().trim().min(1).max(BOARD_COLUMN_NAME_MAX),
  category: z.enum(COLUMN_CATEGORIES),
  wipLimit: z.number().int().min(1).max(999).nullable(),
});

export const createBoardInput = z.object({
  projectId: z.number().int().positive().nullable(),
  name: boardName,
  description: boardDescription,
  columns: z.array(boardColumnDraftInput).min(1).max(MAX_BOARD_COLUMNS),
});

export type CreateBoardInput = z.input<typeof createBoardInput>;

export const updateBoardInput = z.object({
  boardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  name: boardName,
  description: boardDescription,
});

export type UpdateBoardInput = z.input<typeof updateBoardInput>;

export const deleteBoardInput = z.object({
  boardId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteBoardInput = z.input<typeof deleteBoardInput>;
