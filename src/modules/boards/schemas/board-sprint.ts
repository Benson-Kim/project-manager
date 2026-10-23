import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { BOARD_SPRINT_GOAL_MAX, BOARD_SPRINT_NAME_MAX, SPRINT_STATES } from "./board-rules";

/**
 * Board sprint (app.BoardSprint) — zod contracts, mirroring the SELECT shape of
 * usp_BoardSprint_{Create,Update,Start,Complete}. Every input is an explicit
 * allow-list: BoardSprintId, BoardId, CreatedBy and RowVer are the server's to
 * set, so a payload can never carry a field the proc does not take.
 *
 * THE STATE IS NOT AN INPUT, anywhere in this file. A sprint's lifecycle moves
 * planned -> active -> completed through its own intentions — startBoardSprint
 * and completeBoardSprint — because each transition carries work with it:
 * starting one changes which cards every column counts, and completing one
 * moves the unfinished cards. `state`, `startedAtUtc` and `completedAtUtc` are
 * therefore absent from the update contract, absent from the proc's parameter
 * list, and a guardrail fails the build if they appear in either. Renaming a
 * sprint must never be able to start or finish it as a side effect.
 *
 * A sprint never moves between boards, so BoardId is not an input on update.
 */

const sprintName = z.string().trim().min(1).max(BOARD_SPRINT_NAME_MAX);
const sprintGoal = z.string().trim().max(BOARD_SPRINT_GOAL_MAX).nullish();

/**
 * Both dates are required: app.BoardSprint.StartDate and .EndDate are NOT NULL,
 * because a sprint is a timebox and one without dates is a phase. The ordering
 * rule is CK_BoardSprint_Dates in the database and is checked by the procs.
 */
const sprintDate = z.coerce.date();

/**
 * The sprint entity, as the four write procs return it. The planning view needs
 * two more columns — the card and story-point totals — which belong to the read
 * model and not to the row, so board-view.ts extends this schema rather than
 * restating its ten columns. One definition of what a sprint is.
 */
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
});

export type BoardSprintRow = z.infer<typeof boardSprintRowSchema>;

export const createBoardSprintInput = z.object({
  boardId: z.number().int().positive(),
  name: sprintName,
  startDate: sprintDate,
  endDate: sprintDate,
  goal: sprintGoal,
  /** NULL is a sprint that groups under no phase, which is normal. */
  boardPhaseId: z.number().int().positive().nullish(),
});

export type CreateBoardSprintInput = z.input<typeof createBoardSprintInput>;

export const updateBoardSprintInput = z.object({
  boardSprintId: z.number().int().positive(),
  rowVer: rowVerSchema,
  name: sprintName,
  startDate: sprintDate,
  endDate: sprintDate,
  goal: sprintGoal,
  boardPhaseId: z.number().int().positive().nullish(),
});

export type UpdateBoardSprintInput = z.input<typeof updateBoardSprintInput>;

/** Starting a sprint takes nothing but the sprint and the version the client holds. */
export const startBoardSprintInput = z.object({
  boardSprintId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type StartBoardSprintInput = z.input<typeof startBoardSprintInput>;

/**
 * Completing a sprint decides where the unfinished cards go: a planned sprint,
 * or the backlog when `unfinishedToSprintId` is absent. Cards already in a done
 * column stay in the completed sprint. There is no reopen, so the dialog names
 * the consequence first (messages.boards.completeSprintBody).
 */
export const completeBoardSprintInput = z.object({
  boardSprintId: z.number().int().positive(),
  rowVer: rowVerSchema,
  unfinishedToSprintId: z.number().int().positive().nullish(),
});

export type CompleteBoardSprintInput = z.input<typeof completeBoardSprintInput>;

/** Deleting a planned sprint sends its cards to the backlog, keeping their columns. */
export const deleteBoardSprintInput = z.object({
  boardSprintId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteBoardSprintInput = z.input<typeof deleteBoardSprintInput>;

/** What usp_BoardSprint_Complete reports back: enough to say "12 done, 3 moved". */
export const boardSprintCompletedSchema = z.object({
  MovedCards: z.number().int(),
  KeptCards: z.number().int(),
  MovedToSprintId: z.number().int().nullable(),
});

export type BoardSprintCompleted = z.infer<typeof boardSprintCompletedSchema>;

/** What usp_BoardSprint_Delete reports back. */
export const boardSprintDeletedSchema = z.object({
  CardsToBacklog: z.number().int(),
});

export type BoardSprintDeleted = z.infer<typeof boardSprintDeletedSchema>;
