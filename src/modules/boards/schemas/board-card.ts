import { z } from "zod";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import { richTextSchema } from "@/lib/rich-text/schema";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { REQUIREMENT_TYPES } from "@/modules/requirements/schemas/requirement-types";
import {
  BOARD_CARD_TITLE_MAX,
  BOARD_RICH_TEXT_MAX,
  REQUIREMENT_STATES,
  STORY_POINTS_MAX,
} from "./board-rules";

/**
 * Board card (app.BoardCard) — zod contracts, mirroring the SELECT shape of
 * usp_BoardCard_{Create,GetById,Update,Move} and set 5 of usp_Board_GetBoard.
 *
 * Every input is an explicit allow-list. BoardCardId, BoardId, RequirementId,
 * CreatedBy, SortKey and RowVer are the server's to set, so a payload can never
 * carry a field the proc does not take: a card cannot be re-boarded, attached to
 * a requirement, or re-ranked by editing it. Moving is its own intention
 * (usp_BoardCard_Move, which checks the WIP limit), and attaching a requirement
 * is packaging.
 */

/** app.BoardCard.SortKey. BIGINT, and a head insert may rank a card below zero. */
const sortKeySchema = z.coerce.number().int();

const cardTitle = z.string().trim().min(1).max(BOARD_CARD_TITLE_MAX);
const storyPoints = z.number().int().min(0).max(STORY_POINTS_MAX).nullable();
const cardColor = z.enum(OPTION_COLORS).nullable();

/** The requirement columns every card read carries, NULL on a redacted card. */
const requirementFields = {
  RequirementState: z.enum(REQUIREMENT_STATES),
  RequirementId: z.number().int().nullable(),
  RequirementType: z.enum(REQUIREMENT_TYPES).nullable(),
  RequirementNumber: z.number().int().nullable(),
  RequirementText: z.string().nullable(),
  RequirementIsMet: z.boolean().nullable(),
  RequirementProjectId: z.number().int().nullable(),
};

/** What the card write procs return. */
export const boardCardRowSchema = z.object({
  BoardCardId: z.number().int(),
  BoardId: z.number().int(),
  BoardColumnId: z.number().int(),
  BoardSprintId: z.number().int().nullable(),
  RequirementId: z.number().int().nullable(),
  Title: z.string().nullable(),
  AssigneeUserId: z.number().int().nullable(),
  DueDate: z.date().nullable(),
  StoryPoints: z.number().int().nullable(),
  Color: z.enum(OPTION_COLORS).nullable(),
  SortKey: sortKeySchema,
  RowVer: rowVerSchema,
});

export type BoardCardRow = z.infer<typeof boardCardRowSchema>;

/** usp_Board_GetBoard set 5: a card as the board and planning views draw it. */
export const boardCardListRowSchema = boardCardRowSchema.omit({ RequirementId: true }).extend({
  ...requirementFields,
});

export type BoardCardListRow = z.infer<typeof boardCardListRowSchema>;

/** usp_BoardCard_GetById: the card sheet, which is the only read that loads Notes. */
export const boardCardDetailRowSchema = boardCardListRowSchema.extend({
  Notes: z.string().nullable(),
  AssigneeName: z.string().nullable(),
  CreatedBy: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
});

export type BoardCardDetailRow = z.infer<typeof boardCardDetailRowSchema>;

export const createBoardCardInput = z.object({
  boardId: z.number().int().positive(),
  boardColumnId: z.number().int().positive(),
  boardSprintId: z.number().int().positive().nullish(),
  title: cardTitle,
  notes: richTextSchema({ max: BOARD_RICH_TEXT_MAX }).nullish(),
  assigneeUserId: z.number().int().positive().nullish(),
  dueDate: z.coerce.date().nullish(),
  storyPoints: storyPoints.nullish(),
  color: cardColor.nullish(),
});

export type CreateBoardCardInput = z.input<typeof createBoardCardInput>;

/**
 * An edit carries every field it owns, so leaving one out clears it rather than
 * keeping an old value the user can no longer see (the standards' explicit-update
 * rule). The fields an edit does NOT own — column, sprint, board, requirement,
 * rank — are simply absent.
 */
export const updateBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  title: cardTitle.nullable(),
  notes: richTextSchema({ max: BOARD_RICH_TEXT_MAX }).nullish(),
  assigneeUserId: z.number().int().positive().nullable(),
  dueDate: z.coerce.date().nullable(),
  storyPoints: storyPoints,
  color: cardColor,
});

export type UpdateBoardCardInput = z.input<typeof updateBoardCardInput>;

/**
 * `sprintSet` separates "leave the sprint alone" from "set it to sprintId,
 * null meaning the backlog". Without it a null could not say which was meant,
 * and every column move would quietly send the card to the backlog.
 */
export const moveBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
  toColumnId: z.number().int().positive(),
  toSprintId: z.number().int().positive().nullish(),
  sprintSet: z.boolean().default(false),
  beforeCardId: z.number().int().positive().nullish(),
});

export type MoveBoardCardInput = z.input<typeof moveBoardCardInput>;

export const deleteBoardCardInput = z.object({
  boardCardId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteBoardCardInput = z.input<typeof deleteBoardCardInput>;
