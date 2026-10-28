import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { BOARD_PHASE_NAME_MAX } from "./board-rules";

/**
 * Board phase (app.BoardPhase) — zod contracts, mirroring the SELECT shape of
 * usp_BoardPhase_{Create,Update,Move}. Every input is an explicit allow-list:
 * BoardPhaseId, BoardId, SortOrder, CreatedBy and RowVer are the server's to
 * set, so a payload can never carry a field the proc does not take.
 *
 * A phase never moves between boards, so BoardId is not an input on update or
 * move; and SortOrder is not an input at all, because ordering is its own
 * intention (usp_BoardPhase_Move) rather than a field on an edit.
 */

const phaseName = z.string().trim().min(1).max(BOARD_PHASE_NAME_MAX);

/**
 * A phase's dates are both optional and independent: a phase can be named
 * before anyone knows when it runs, and dated once its sprints are planned.
 * The ordering rule (end on or after start) is CK_BoardPhase_Dates in the
 * database and is checked by the proc, so a bad pair answers VALIDATION.
 */
const phaseDate = z.coerce.date().nullish();

/** Set 3 of usp_Board_GetBoard, and what the three phase write procs return. */
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

export const createBoardPhaseInput = z.object({
  boardId: z.number().int().positive(),
  name: phaseName,
  startDate: phaseDate,
  endDate: phaseDate,
});

export type CreateBoardPhaseInput = z.input<typeof createBoardPhaseInput>;

export const updateBoardPhaseInput = z.object({
  boardPhaseId: z.number().int().positive(),
  rowVer: rowVerSchema,
  name: phaseName,
  startDate: phaseDate,
  endDate: phaseDate,
});

export type UpdateBoardPhaseInput = z.input<typeof updateBoardPhaseInput>;

/** Phases reorder one place at a time, the same idiom as columns. */
export const BOARD_PHASE_MOVE_DIRECTIONS = ["up", "down"] as const;

export const moveBoardPhaseInput = z.object({
  boardPhaseId: z.number().int().positive(),
  direction: z.enum(BOARD_PHASE_MOVE_DIRECTIONS),
  rowVer: rowVerSchema,
});

export type MoveBoardPhaseInput = z.input<typeof moveBoardPhaseInput>;

/**
 * Deleting a phase does not delete its sprints: they are released to "no
 * phase", which the schema allows. The dialog names that consequence first
 * (messages.boards.deletePhaseBody).
 */
export const deleteBoardPhaseInput = z.object({
  boardPhaseId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteBoardPhaseInput = z.input<typeof deleteBoardPhaseInput>;

/** What usp_BoardPhase_Delete reports back, so the interface can say what changed. */
export const boardPhaseDeletedSchema = z.object({
  ReleasedSprints: z.number().int(),
});

export type BoardPhaseDeleted = z.infer<typeof boardPhaseDeletedSchema>;
