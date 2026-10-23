import { execProc } from "@/lib/db";
import {
  boardColumnRowSchema,
  createBoardColumnInput,
  moveBoardColumnInput,
  updateBoardColumnInput,
  type BoardColumnRow,
  type CreateBoardColumnInput,
  type MoveBoardColumnInput,
  type UpdateBoardColumnInput,
} from "../schemas/board-column";

/**
 * Board column repository — stored procedures only (ADR-0028), rows zod-parsed
 * at the boundary (STANDARDS §2.5).
 *
 * Every call spells out the parameters it sends; nothing spreads the caller's
 * input into a proc call, so an extra key in a payload cannot reach the
 * database even if a schema is widened later. src/modules/boards/tests asserts
 * these exact parameter sets. The board column procs take no BoardId on update
 * or move: a column never changes board.
 */

export async function createBoardColumn(
  input: CreateBoardColumnInput,
  actorUserId: number,
): Promise<BoardColumnRow> {
  const parsed = createBoardColumnInput.parse(input);
  const rows = await execProc<BoardColumnRow>("usp_BoardColumn_Create", {
    BoardId: parsed.boardId,
    Name: parsed.name,
    Category: parsed.category,
    WipLimit: parsed.wipLimit,
    ActorUserId: actorUserId,
  });
  return boardColumnRowSchema.parse(rows[0]);
}

export async function updateBoardColumn(
  input: UpdateBoardColumnInput,
  actorUserId: number,
): Promise<BoardColumnRow> {
  const parsed = updateBoardColumnInput.parse(input);
  const rows = await execProc<BoardColumnRow>("usp_BoardColumn_Update", {
    BoardColumnId: parsed.boardColumnId,
    RowVer: parsed.rowVer,
    Name: parsed.name,
    Category: parsed.category,
    WipLimit: parsed.wipLimit,
    ActorUserId: actorUserId,
  });
  return boardColumnRowSchema.parse(rows[0]);
}

export async function moveBoardColumn(
  input: MoveBoardColumnInput,
  actorUserId: number,
): Promise<BoardColumnRow> {
  const parsed = moveBoardColumnInput.parse(input);
  const rows = await execProc<BoardColumnRow>("usp_BoardColumn_Move", {
    BoardColumnId: parsed.boardColumnId,
    Direction: parsed.direction,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return boardColumnRowSchema.parse(rows[0]);
}
