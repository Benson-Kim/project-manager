"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { createBoard, deleteBoard, updateBoard } from "../repository/boards";
import { createBoardInput, deleteBoardInput, updateBoardInput } from "../schemas/board";

/**
 * Board mutations. Each one is an intention with its own boards:* permission:
 * the action wrapper checks the global role (src/lib/action.ts) and the proc
 * checks the actor's level on the board itself (dbo.usp_Board_AssertAccess),
 * which is the check that decides. A board appears on two routes — the
 * cross-project list and its project's section — so both are revalidated.
 */

function revalidateBoards(projectId: number | null | undefined) {
  revalidatePath("/boards");
  if (projectId) revalidatePath(`/projects/${projectId}/boards`);
}

/** Create a board (boards:create — the project level is checked in-proc; audited in-proc). */
export const createBoardAction = action({
  name: "boards.create",
  schema: createBoardInput,
  permission: "boards:create",
  handler: async (input, ctx) => {
    const board = await createBoard(input, ctx.session.userId);
    revalidateBoards(board.ProjectId);
    return board;
  },
});

/** Rename a board or change its description (boards:update; CONFLICT on a stale RowVer). */
export const updateBoardAction = action({
  name: "boards.update",
  schema: updateBoardInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const board = await updateBoard(input, ctx.session.userId);
    revalidateBoards(board.ProjectId);
    return board;
  },
});

/** Soft-delete a board (boards:delete — Manager on it, or a granted override; audited in-proc). */
export const deleteBoardAction = action({
  name: "boards.delete",
  schema: deleteBoardInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    await deleteBoard(input.boardId, input.rowVer, ctx.session.userId);
    revalidatePath("/boards");
    return { boardId: input.boardId };
  },
});
