import { execProc, execProcSets } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  boardCardDetailRowSchema,
  boardCardRowSchema,
  createBoardCardInput,
  deleteBoardCardInput,
  linkBoardCardInput,
  moveBoardCardInput,
  updateBoardCardInput,
  type BoardCardDetailRow,
  type BoardCardRow,
  type CreateBoardCardInput,
  type DeleteBoardCardInput,
  type LinkBoardCardInput,
  type MoveBoardCardInput,
  type UpdateBoardCardInput,
} from "../schemas/board-card";

/**
 * Board card repository — stored procedures only (ADR-0028), rows zod-parsed at
 * the boundary (STANDARDS §2.5).
 *
 * Every call spells out the parameters it sends; nothing spreads the caller's
 * input into a proc call, so an extra key in a payload cannot reach the database
 * even if a schema is widened later. src/modules/boards/tests asserts these exact
 * parameter sets — that assertion is the mass-assignment pin, and it is what
 * keeps BoardId, RequirementId, CreatedBy and SortKey server-owned.
 */

export async function createBoardCard(
  input: CreateBoardCardInput,
  actorUserId: number,
): Promise<BoardCardRow> {
  const parsed = createBoardCardInput.parse(input);
  const rows = await execProc<BoardCardRow>("usp_BoardCard_Create", {
    BoardId: parsed.boardId,
    BoardColumnId: parsed.boardColumnId,
    BoardSprintId: parsed.boardSprintId ?? null,
    Title: parsed.title,
    Notes: parsed.notes ?? null,
    AssigneeUserId: parsed.assigneeUserId ?? null,
    DueDate: parsed.dueDate ?? null,
    StoryPoints: parsed.storyPoints ?? null,
    Color: parsed.color ?? null,
    ActorUserId: actorUserId,
  });
  return boardCardRowSchema.parse(rows[0]);
}

export async function getBoardCardById(
  boardCardId: number,
  actorUserId: number,
): Promise<BoardCardDetailRow> {
  const [cards = [], requirements = []] = await execProcSets("usp_BoardCard_GetById", {
    BoardCardId: boardCardId,
    ActorUserId: actorUserId,
  });
  const card = cards[0];
  if (!card) throw new AppError("NOT_FOUND", "Card not found");
  return boardCardDetailRowSchema.parse({ ...card, DeliverableRequirements: requirements });
}

export async function updateBoardCard(
  input: UpdateBoardCardInput,
  actorUserId: number,
): Promise<BoardCardRow> {
  const parsed = updateBoardCardInput.parse(input);
  const rows = await execProc<BoardCardRow>("usp_BoardCard_Update", {
    BoardCardId: parsed.boardCardId,
    RowVer: parsed.rowVer,
    Title: parsed.title,
    Notes: parsed.notes ?? null,
    AssigneeUserId: parsed.assigneeUserId,
    DueDate: parsed.dueDate,
    StoryPoints: parsed.storyPoints,
    Color: parsed.color,
    ActorUserId: actorUserId,
  });
  return boardCardRowSchema.parse(rows[0]);
}

export async function moveBoardCard(
  input: MoveBoardCardInput,
  actorUserId: number,
): Promise<BoardCardRow> {
  const parsed = moveBoardCardInput.parse(input);
  const rows = await execProc<BoardCardRow>("usp_BoardCard_Move", {
    BoardCardId: parsed.boardCardId,
    RowVer: parsed.rowVer,
    ToColumnId: parsed.toColumnId,
    ToSprintId: parsed.toSprintId ?? null,
    // The proc cannot tell "leave the sprint alone" from "send it to the backlog"
    // without this, because both would arrive as a null ToSprintId.
    SprintSet: parsed.sprintSet,
    BeforeCardId: parsed.beforeCardId ?? null,
    ActorUserId: actorUserId,
  });
  return boardCardRowSchema.parse(rows[0]);
}

export async function deleteBoardCard(
  input: DeleteBoardCardInput,
  actorUserId: number,
): Promise<void> {
  const parsed = deleteBoardCardInput.parse(input);
  await execProc("usp_BoardCard_Delete", {
    BoardCardId: parsed.boardCardId,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
}

/**
 * Attach a requirement to an existing card, or detach it with null (usp_BoardCard_LinkRequirement).
 * Its own intention, apart from an edit: the proc checks the requirement's project, that no other
 * live card on the board has it, and that a card left with no requirement still shows something.
 */
export async function linkBoardCardRequirement(
  input: LinkBoardCardInput,
  actorUserId: number,
): Promise<BoardCardRow> {
  const parsed = linkBoardCardInput.parse(input);
  const rows = await execProc<BoardCardRow>("usp_BoardCard_LinkRequirement", {
    BoardCardId: parsed.boardCardId,
    RowVer: parsed.rowVer,
    RequirementId: parsed.requirementId,
    ActorUserId: actorUserId,
  });
  return boardCardRowSchema.parse(rows[0]);
}
