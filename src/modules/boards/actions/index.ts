"use server";

import {
  getBoardCardById,
  createBoardCard,
  updateBoardCard,
  moveBoardCard,
  deleteBoardCard,
} from "../repository/board-cards";
import {
  createBoardCardInput,
  updateBoardCardInput,
  moveBoardCardInput,
  deleteBoardCardInput,
} from "../schemas/board-card";
import {
  createBoardColumn,
  updateBoardColumn,
  moveBoardColumn,
  deleteBoardColumn,
} from "../repository/board-columns";
import {
  createBoardColumnInput,
  updateBoardColumnInput,
  moveBoardColumnInput,
  deleteBoardColumnInput,
} from "../schemas/board-column";
import {
  createBoardPhase,
  updateBoardPhase,
  moveBoardPhase,
  deleteBoardPhase,
} from "../repository/board-phases";
import {
  createBoardPhaseInput,
  updateBoardPhaseInput,
  moveBoardPhaseInput,
  deleteBoardPhaseInput,
} from "../schemas/board-phase";
import {
  createBoardSprint,
  updateBoardSprint,
  startBoardSprint,
  completeBoardSprint,
  deleteBoardSprint,
} from "../repository/board-sprints";
import {
  createBoardSprintInput,
  updateBoardSprintInput,
  startBoardSprintInput,
  completeBoardSprintInput,
  deleteBoardSprintInput,
} from "../schemas/board-sprint";
import { setBoardProject } from "../repository/boards";
import { setBoardProjectInput } from "../schemas/board";

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
  refreshBoardViews();
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
    refreshBoardViews();
    return { boardId: input.boardId };
  },
});

function refreshBoardViews() {
  revalidatePath("/boards", "layout");
  revalidatePath("/projects/[id]/boards", "page");
}

export const createBoardCardAction = action({
  name: "boards.createCard",
  schema: createBoardCardInput,
  permission: "boards:create",
  handler: async (input, ctx) => {
    const result = await createBoardCard(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const updateBoardCardAction = action({
  name: "boards.updateCard",
  schema: updateBoardCardInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await updateBoardCard(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const moveBoardCardAction = action({
  name: "boards.moveCard",
  schema: moveBoardCardInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await moveBoardCard(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const deleteBoardCardAction = action({
  name: "boards.deleteCard",
  schema: deleteBoardCardInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    const result = await deleteBoardCard(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const createBoardColumnAction = action({
  name: "boards.createColumn",
  schema: createBoardColumnInput,
  permission: "boards:create",
  handler: async (input, ctx) => {
    const result = await createBoardColumn(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const updateBoardColumnAction = action({
  name: "boards.updateColumn",
  schema: updateBoardColumnInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await updateBoardColumn(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const moveBoardColumnAction = action({
  name: "boards.moveColumn",
  schema: moveBoardColumnInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await moveBoardColumn(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const deleteBoardColumnAction = action({
  name: "boards.deleteColumn",
  schema: deleteBoardColumnInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    const result = await deleteBoardColumn(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const createBoardPhaseAction = action({
  name: "boards.createPhase",
  schema: createBoardPhaseInput,
  permission: "boards:create",
  handler: async (input, ctx) => {
    const result = await createBoardPhase(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const updateBoardPhaseAction = action({
  name: "boards.updatePhase",
  schema: updateBoardPhaseInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await updateBoardPhase(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const moveBoardPhaseAction = action({
  name: "boards.movePhase",
  schema: moveBoardPhaseInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await moveBoardPhase(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const deleteBoardPhaseAction = action({
  name: "boards.deletePhase",
  schema: deleteBoardPhaseInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    const result = await deleteBoardPhase(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const createBoardSprintAction = action({
  name: "boards.createSprint",
  schema: createBoardSprintInput,
  permission: "boards:create",
  handler: async (input, ctx) => {
    const result = await createBoardSprint(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const updateBoardSprintAction = action({
  name: "boards.updateSprint",
  schema: updateBoardSprintInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await updateBoardSprint(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const startBoardSprintAction = action({
  name: "boards.startSprint",
  schema: startBoardSprintInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await startBoardSprint(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const completeBoardSprintAction = action({
  name: "boards.completeSprint",
  schema: completeBoardSprintInput,
  permission: "boards:update",
  handler: async (input, ctx) => {
    const result = await completeBoardSprint(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const deleteBoardSprintAction = action({
  name: "boards.deleteSprint",
  schema: deleteBoardSprintInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    const result = await deleteBoardSprint(input, ctx.session.userId);
    refreshBoardViews();
    return result ?? null;
  },
});

export const setBoardProjectAction = action({
  name: "boards.setProject",
  schema: setBoardProjectInput,
  permission: "boards:delete",
  handler: async (input, ctx) => {
    const result = await setBoardProject(input, ctx.session.userId);
    refreshBoardViews();
    return result;
  },
});

export const readBoardCardAction = action({
  name: "boards.cardDetails",
  schema: deleteBoardCardInput.pick({ boardCardId: true }),
  permission: "boards:read",
  handler: async (input, ctx) => getBoardCardById(input.boardCardId, ctx.session.userId),
});
