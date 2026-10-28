import { execProc } from "@/lib/db";
import {
  boardSprintCompletedSchema,
  boardSprintDeletedSchema,
  boardSprintRowSchema,
  completeBoardSprintInput,
  createBoardSprintInput,
  deleteBoardSprintInput,
  startBoardSprintInput,
  updateBoardSprintInput,
  type BoardSprintCompleted,
  type BoardSprintDeleted,
  type BoardSprintRow,
  type CompleteBoardSprintInput,
  type CreateBoardSprintInput,
  type DeleteBoardSprintInput,
  type StartBoardSprintInput,
  type UpdateBoardSprintInput,
} from "../schemas/board-sprint";

/**
 * Board sprint repository — stored procedures only (ADR-0028), rows zod-parsed
 * at the boundary (STANDARDS §2.5).
 *
 * Every call spells out the parameters it sends; nothing spreads the caller's
 * input into a proc call, so an extra key in a payload cannot reach the
 * database even if a schema is widened later. src/modules/boards/tests asserts
 * these exact parameter sets.
 *
 * THE LIFECYCLE IS THREE SEPARATE CALLS. No function here sends State,
 * StartedAtUtc or CompletedAtUtc: starting and completing are their own procs,
 * because each one carries work with it (a start changes which cards every
 * column counts; a completion moves the unfinished cards). An update that could
 * also set the state would make that work a side effect of an edit.
 */

export async function createBoardSprint(
  input: CreateBoardSprintInput,
  actorUserId: number,
): Promise<BoardSprintRow> {
  const parsed = createBoardSprintInput.parse(input);
  const rows = await execProc<BoardSprintRow>("usp_BoardSprint_Create", {
    BoardId: parsed.boardId,
    Name: parsed.name,
    StartDate: parsed.startDate,
    EndDate: parsed.endDate,
    Goal: parsed.goal ?? null,
    BoardPhaseId: parsed.boardPhaseId ?? null,
    ActorUserId: actorUserId,
  });
  return boardSprintRowSchema.parse(rows[0]);
}

export async function updateBoardSprint(
  input: UpdateBoardSprintInput,
  actorUserId: number,
): Promise<BoardSprintRow> {
  const parsed = updateBoardSprintInput.parse(input);
  const rows = await execProc<BoardSprintRow>("usp_BoardSprint_Update", {
    BoardSprintId: parsed.boardSprintId,
    RowVer: parsed.rowVer,
    Name: parsed.name,
    StartDate: parsed.startDate,
    EndDate: parsed.endDate,
    Goal: parsed.goal ?? null,
    BoardPhaseId: parsed.boardPhaseId ?? null,
    ActorUserId: actorUserId,
  });
  return boardSprintRowSchema.parse(rows[0]);
}

/** planned -> active. Refused with LIMIT_REACHED (50007) while another sprint is running. */
export async function startBoardSprint(
  input: StartBoardSprintInput,
  actorUserId: number,
): Promise<BoardSprintRow> {
  const parsed = startBoardSprintInput.parse(input);
  const rows = await execProc<BoardSprintRow>("usp_BoardSprint_Start", {
    BoardSprintId: parsed.boardSprintId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return boardSprintRowSchema.parse(rows[0]);
}

/**
 * active -> completed, in one transaction with the card moves. Unfinished cards
 * (those outside a done column) go to unfinishedToSprintId, or to the backlog
 * when it is absent; the counts come back so the interface can say what
 * happened. There is no reopen.
 */
export async function completeBoardSprint(
  input: CompleteBoardSprintInput,
  actorUserId: number,
): Promise<BoardSprintCompleted> {
  const parsed = completeBoardSprintInput.parse(input);
  const rows = await execProc<BoardSprintCompleted>("usp_BoardSprint_Complete", {
    BoardSprintId: parsed.boardSprintId,
    RowVer: parsed.rowVer,
    UnfinishedToSprintId: parsed.unfinishedToSprintId ?? null,
    ActorUserId: actorUserId,
  });
  return boardSprintCompletedSchema.parse(rows[0]);
}

/** Soft-delete a planned sprint, sending its cards to the backlog with their columns intact. */
export async function deleteBoardSprint(
  input: DeleteBoardSprintInput,
  actorUserId: number,
): Promise<BoardSprintDeleted> {
  const parsed = deleteBoardSprintInput.parse(input);
  const rows = await execProc<BoardSprintDeleted>("usp_BoardSprint_Delete", {
    BoardSprintId: parsed.boardSprintId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return boardSprintDeletedSchema.parse(rows[0]);
}
