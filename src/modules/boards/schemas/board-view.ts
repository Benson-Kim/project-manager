import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { boardCardListRowSchema } from "./board-card";
import { boardColumnRowSchema } from "./board-column";
import { boardPhaseRowSchema, type BoardPhaseRow } from "./board-phase";
import { BOARD_VIEWS, CARDS_PER_LIST, CARDS_PER_LIST_MAX } from "./board-rules";
import { boardSprintRowSchema } from "./board-sprint";

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

/** Set 3: the phases that group the sprints. The phase entity, unchanged by the read. */
export { boardPhaseRowSchema, type BoardPhaseRow };

/**
 * Set 4: the sprints, with the two totals the planning view shows. The ten
 * columns of a sprint are defined once, in board-sprint.ts; this extends them
 * with the aggregates, which belong to the read and are not part of the row any
 * write proc returns.
 */
export const boardSprintViewRowSchema = boardSprintRowSchema.extend({
  CardCount: z.number().int(),
  PointTotal: z.number().int(),
});

export type BoardSprintViewRow = z.infer<typeof boardSprintViewRowSchema>;

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
  sprints: BoardSprintViewRow[];
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
