import { execProc } from "@/lib/db";
import {
  boardPhaseDeletedSchema,
  boardPhaseRowSchema,
  createBoardPhaseInput,
  deleteBoardPhaseInput,
  moveBoardPhaseInput,
  updateBoardPhaseInput,
  type BoardPhaseDeleted,
  type BoardPhaseRow,
  type CreateBoardPhaseInput,
  type DeleteBoardPhaseInput,
  type MoveBoardPhaseInput,
  type UpdateBoardPhaseInput,
} from "../schemas/board-phase";

/**
 * Board phase repository — stored procedures only (ADR-0028), rows zod-parsed
 * at the boundary (STANDARDS §2.5).
 *
 * Every call spells out the parameters it sends; nothing spreads the caller's
 * input into a proc call, so an extra key in a payload cannot reach the
 * database even if a schema is widened later. src/modules/boards/tests asserts
 * these exact parameter sets. The phase procs take no BoardId on update, move
 * or delete: a phase never changes board, and no call sends SortOrder, because
 * ordering is movePhase's job alone.
 */

export async function createBoardPhase(
  input: CreateBoardPhaseInput,
  actorUserId: number,
): Promise<BoardPhaseRow> {
  const parsed = createBoardPhaseInput.parse(input);
  const rows = await execProc<BoardPhaseRow>("usp_BoardPhase_Create", {
    BoardId: parsed.boardId,
    Name: parsed.name,
    StartDate: parsed.startDate ?? null,
    EndDate: parsed.endDate ?? null,
    ActorUserId: actorUserId,
  });
  return boardPhaseRowSchema.parse(rows[0]);
}

export async function updateBoardPhase(
  input: UpdateBoardPhaseInput,
  actorUserId: number,
): Promise<BoardPhaseRow> {
  const parsed = updateBoardPhaseInput.parse(input);
  const rows = await execProc<BoardPhaseRow>("usp_BoardPhase_Update", {
    BoardPhaseId: parsed.boardPhaseId,
    RowVer: parsed.rowVer,
    Name: parsed.name,
    StartDate: parsed.startDate ?? null,
    EndDate: parsed.endDate ?? null,
    ActorUserId: actorUserId,
  });
  return boardPhaseRowSchema.parse(rows[0]);
}

export async function moveBoardPhase(
  input: MoveBoardPhaseInput,
  actorUserId: number,
): Promise<BoardPhaseRow> {
  const parsed = moveBoardPhaseInput.parse(input);
  const rows = await execProc<BoardPhaseRow>("usp_BoardPhase_Move", {
    BoardPhaseId: parsed.boardPhaseId,
    Direction: parsed.direction,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return boardPhaseRowSchema.parse(rows[0]);
}

/** Soft-delete a phase, releasing its sprints to no phase; reports how many were released. */
export async function deleteBoardPhase(
  input: DeleteBoardPhaseInput,
  actorUserId: number,
): Promise<BoardPhaseDeleted> {
  const parsed = deleteBoardPhaseInput.parse(input);
  const rows = await execProc<BoardPhaseDeleted>("usp_BoardPhase_Delete", {
    BoardPhaseId: parsed.boardPhaseId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return boardPhaseDeletedSchema.parse(rows[0]);
}
