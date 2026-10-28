import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { BOARD_COLUMN_NAME_MAX, COLUMN_CATEGORIES, WIP_LIMIT_MAX } from "./board-rules";

/**
 * Board column (app.BoardColumn) — zod contracts, mirroring the SELECT shape of
 * usp_BoardColumn_{Create,Update,Move}. Every input is an explicit allow-list:
 * BoardColumnId, BoardId, SortOrder, CreatedBy and RowVer are the server's to
 * set, so a payload can never carry a field the proc does not take. A column is
 * never moved between boards, so BoardId is not an input on update or move.
 */

const columnName = z.string().trim().min(1).max(BOARD_COLUMN_NAME_MAX);
const wipLimit = z.number().int().min(1).max(WIP_LIMIT_MAX).nullable();

export const boardColumnRowSchema = z.object({
  BoardColumnId: z.number().int(),
  BoardId: z.number().int(),
  Name: z.string(),
  Category: z.enum(COLUMN_CATEGORIES),
  WipLimit: z.number().int().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});

export type BoardColumnRow = z.infer<typeof boardColumnRowSchema>;

export const createBoardColumnInput = z.object({
  boardId: z.number().int().positive(),
  name: columnName,
  category: z.enum(COLUMN_CATEGORIES),
  wipLimit: wipLimit,
});

export type CreateBoardColumnInput = z.input<typeof createBoardColumnInput>;

export const updateBoardColumnInput = z.object({
  boardColumnId: z.number().int().positive(),
  rowVer: rowVerSchema,
  name: columnName,
  category: z.enum(COLUMN_CATEGORIES),
  wipLimit: wipLimit,
});

export type UpdateBoardColumnInput = z.input<typeof updateBoardColumnInput>;

/** Columns reorder one place at a time; a positional move can replace this when the board view lands. */
export const BOARD_COLUMN_MOVE_DIRECTIONS = ["up", "down"] as const;

export const moveBoardColumnInput = z.object({
  boardColumnId: z.number().int().positive(),
  direction: z.enum(BOARD_COLUMN_MOVE_DIRECTIONS),
  rowVer: rowVerSchema,
});

export type MoveBoardColumnInput = z.input<typeof moveBoardColumnInput>;

/**
 * Deleting a column does not delete its cards: they move to targetColumnId,
 * which the proc requires whenever the column holds any. The dialog names the
 * consequence first (messages.boards.deleteColumnBody), so nobody relocates
 * other people's work by accident.
 */
export const deleteBoardColumnInput = z.object({
  boardColumnId: z.number().int().positive(),
  rowVer: rowVerSchema,
  targetColumnId: z.number().int().positive().nullish(),
});

export type DeleteBoardColumnInput = z.input<typeof deleteBoardColumnInput>;

/** What usp_BoardColumn_Delete reports back, so the interface can say what moved. */
export const boardColumnDeletedSchema = z.object({
  MovedCards: z.number().int(),
  MovedToColumnId: z.number().int().nullable(),
});

export type BoardColumnDeleted = z.infer<typeof boardColumnDeletedSchema>;
