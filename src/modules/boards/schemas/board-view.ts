import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { boardCardListRowSchema } from "./board-card";
import { boardColumnRowSchema } from "./board-column";
import { BOARD_VIEWS, CARDS_PER_LIST, CARDS_PER_LIST_MAX, SPRINT_STATES } from "./board-rules";

/**
 * The board read model (usp_Board_GetBoard) — five result sets, read together
 * through execProcSets and parsed here. It spans four entities, so it lives
 * apart from the per-entity contracts: this is the shape one screen needs, not
 * the shape anything is written in. Nothing here is an input to a write.
 */

/** Set 1: the board itself, the actor's standing on it, and what changed last. */
export const boardHeaderRowSchema = z.object({
  BoardId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  ProjectName: z.string().nullable(),
  Name: z.string(),
  Description: z.string().nullable(),
  CreatedBy: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  ...actorAccessFields,
  /**
   * The highest RowVer across the board and all its children. The view refetches
   * when it changes, so an edit anywhere on the board refreshes every open copy.
   */
  Stamp: rowVerSchema,
  ActiveSprintId: z.number().int().nullable(),
  BacklogCount: z.number().int(),
});

export type BoardHeaderRow = z.infer<typeof boardHeaderRowSchema>;

/**
 * Set 2: a column with its two counts. WipCount is what the limit is measured
 * against (the cards the board is working); CardCount is every live card in the
 * column. They differ whenever a sprint is active or a completed sprint still
 * holds cards here.
 */
export const boardViewColumnRowSchema = boardColumnRowSchema.extend({
  CardCount: z.number().int(),
  WipCount: z.number().int(),
});

export type BoardViewColumnRow = z.infer<typeof boardViewColumnRowSchema>;

/** Set 3: the phases that group the sprints. */
export const boardPhaseRowSchema = z.object({
  BoardPhaseId: z.number().int(),
  BoardId: z.number().int(),
  Name: z.string(),
  StartDate: z.date().nullable(),
  EndDate: z.date().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});

export type BoardPhaseRow = z.infer<typeof boardPhaseRowSchema>;

/** Set 4: the sprints, with the totals the planning view shows. */
export const boardSprintRowSchema = z.object({
  BoardSprintId: z.number().int(),
  BoardId: z.number().int(),
  BoardPhaseId: z.number().int().nullable(),
  Name: z.string(),
  Goal: z.string().nullable(),
  StartDate: z.date(),
  EndDate: z.date(),
  State: z.enum(SPRINT_STATES),
  StartedAtUtc: z.date().nullable(),
  CompletedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  CardCount: z.number().int(),
  PointTotal: z.number().int(),
});

export type BoardSprintRow = z.infer<typeof boardSprintRowSchema>;

/**
 * usp_Board_ListAssignees: the card sheet's picker. UserId and DisplayName
 * only — a picker is not a reason to hand the client usernames, emails or
 * roles, which is the same line usp_User_ListOptions draws.
 */
export const boardAssigneeRowSchema = z.object({
  UserId: z.number().int(),
  DisplayName: z.string(),
});

export type BoardAssigneeRow = z.infer<typeof boardAssigneeRowSchema>;

export interface BoardView {
  header: BoardHeaderRow;
  columns: BoardViewColumnRow[];
  phases: BoardPhaseRow[];
  sprints: BoardSprintRow[];
  cards: z.infer<typeof boardCardListRowSchema>[];
}

/**
 * The read's parameters. cardsPerList is capped here as well as in the proc:
 * the proc's clamp is the one that decides, this one keeps a mistyped value
 * from making the round trip at all.
 */
export const getBoardInput = z.object({
  boardId: z.number().int().positive(),
  view: z.enum(BOARD_VIEWS).default("board"),
  cardsPerList: z.number().int().min(1).max(CARDS_PER_LIST_MAX).default(CARDS_PER_LIST),
  search: z.string().trim().max(100).nullish(),
  sprintId: z.number().int().positive().nullish(),
});

export type GetBoardInput = z.input<typeof getBoardInput>;
