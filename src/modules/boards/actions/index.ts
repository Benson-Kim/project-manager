"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoardOptions,
  setBoardProject,
  updateBoard,
} from "../repository/boards";
import {
  createBoardCard,
  deleteBoardCard,
  getBoardCardById,
  linkBoardCardRequirement,
  moveBoardCard,
  updateBoardCard,
} from "../repository/board-cards";
import {
  createBoardColumn,
  deleteBoardColumn,
  moveBoardColumn,
  updateBoardColumn,
} from "../repository/board-columns";
import {
  listPackagingRequirementOptions,
  packageDeliverables,
  packageRequirements,
} from "../repository/board-package";
import { listDeliverableOptions } from "@/modules/key-deliverables/repository/key-deliverables";
import {
  createBoardPhase,
  deleteBoardPhase,
  moveBoardPhase,
  updateBoardPhase,
} from "../repository/board-phases";
import {
  completeBoardSprint,
  createBoardSprint,
  deleteBoardSprint,
  startBoardSprint,
  updateBoardSprint,
} from "../repository/board-sprints";
import {
  createBoardInput,
  deleteBoardInput,
  setBoardProjectInput,
  updateBoardInput,
} from "../schemas/board";
import {
  createBoardCardInput,
  deleteBoardCardInput,
  linkBoardCardInput,
  moveBoardCardInput,
  readBoardCardInput,
  updateBoardCardInput,
} from "../schemas/board-card";
import {
  createBoardColumnInput,
  deleteBoardColumnInput,
  moveBoardColumnInput,
  updateBoardColumnInput,
} from "../schemas/board-column";
import { packageDeliverablesInput, packageRequirementsInput } from "../schemas/board-package";
import {
  createBoardPhaseInput,
  deleteBoardPhaseInput,
  moveBoardPhaseInput,
  updateBoardPhaseInput,
} from "../schemas/board-phase";
import {
  completeBoardSprintInput,
  createBoardSprintInput,
  deleteBoardSprintInput,
  startBoardSprintInput,
  updateBoardSprintInput,
} from "../schemas/board-sprint";
import { boardMutation } from "./board-mutation";

/**
 * Board mutations. Each one is an intention with its own boards:* permission:
 * the action wrapper checks the global role (src/lib/action.ts) and the proc
 * checks the actor's level on the board itself (dbo.usp_Board_AssertAccess),
 * which is the check that decides. A board appears on two routes — the
 * cross-project list and its project's section — so both are revalidated.
 */

function revalidateBoards(projectId: number | null | undefined) {
  revalidatePath("/boards", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}/boards`, "layout");
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
    revalidatePath("/boards", "layout");
    return { boardId: input.boardId };
  },
});

export const createBoardCardAction = boardMutation({
  name: "boards.createCard",
  schema: createBoardCardInput,
  permission: "boards:create",
  mutate: createBoardCard,
});

export const updateBoardCardAction = boardMutation({
  name: "boards.updateCard",
  schema: updateBoardCardInput,
  permission: "boards:update",
  mutate: updateBoardCard,
});

export const moveBoardCardAction = boardMutation({
  name: "boards.moveCard",
  schema: moveBoardCardInput,
  permission: "boards:update",
  mutate: moveBoardCard,
});

export const deleteBoardCardAction = boardMutation({
  name: "boards.deleteCard",
  schema: deleteBoardCardInput,
  permission: "boards:delete",
  mutate: deleteBoardCard,
});

/** Attach a requirement to an existing card, or detach it with null. The proc also asserts the
 *  actor can read the requirement's project. */
export const linkBoardCardRequirementAction = boardMutation({
  name: "boards.linkRequirement",
  schema: linkBoardCardInput,
  permission: "boards:update",
  mutate: linkBoardCardRequirement,
});

export const createBoardColumnAction = boardMutation({
  name: "boards.createColumn",
  schema: createBoardColumnInput,
  permission: "boards:create",
  mutate: createBoardColumn,
});

export const updateBoardColumnAction = boardMutation({
  name: "boards.updateColumn",
  schema: updateBoardColumnInput,
  permission: "boards:update",
  mutate: updateBoardColumn,
});

export const moveBoardColumnAction = boardMutation({
  name: "boards.moveColumn",
  schema: moveBoardColumnInput,
  permission: "boards:update",
  mutate: moveBoardColumn,
});

export const deleteBoardColumnAction = boardMutation({
  name: "boards.deleteColumn",
  schema: deleteBoardColumnInput,
  permission: "boards:delete",
  mutate: deleteBoardColumn,
});

export const createBoardPhaseAction = boardMutation({
  name: "boards.createPhase",
  schema: createBoardPhaseInput,
  permission: "boards:create",
  mutate: createBoardPhase,
});

export const updateBoardPhaseAction = boardMutation({
  name: "boards.updatePhase",
  schema: updateBoardPhaseInput,
  permission: "boards:update",
  mutate: updateBoardPhase,
});

export const moveBoardPhaseAction = boardMutation({
  name: "boards.movePhase",
  schema: moveBoardPhaseInput,
  permission: "boards:update",
  mutate: moveBoardPhase,
});

export const deleteBoardPhaseAction = boardMutation({
  name: "boards.deletePhase",
  schema: deleteBoardPhaseInput,
  permission: "boards:delete",
  mutate: deleteBoardPhase,
});

export const createBoardSprintAction = boardMutation({
  name: "boards.createSprint",
  schema: createBoardSprintInput,
  permission: "boards:create",
  mutate: createBoardSprint,
});

export const updateBoardSprintAction = boardMutation({
  name: "boards.updateSprint",
  schema: updateBoardSprintInput,
  permission: "boards:update",
  mutate: updateBoardSprint,
});

export const startBoardSprintAction = boardMutation({
  name: "boards.startSprint",
  schema: startBoardSprintInput,
  permission: "boards:update",
  mutate: startBoardSprint,
});

export const completeBoardSprintAction = boardMutation({
  name: "boards.completeSprint",
  schema: completeBoardSprintInput,
  permission: "boards:update",
  mutate: completeBoardSprint,
});

export const deleteBoardSprintAction = boardMutation({
  name: "boards.deleteSprint",
  schema: deleteBoardSprintInput,
  permission: "boards:delete",
  mutate: deleteBoardSprint,
});

export const setBoardProjectAction = boardMutation({
  name: "boards.setProject",
  schema: setBoardProjectInput,
  permission: "boards:delete",
  mutate: setBoardProject,
});

export const readBoardCardAction = action({
  name: "boards.cardDetails",
  schema: readBoardCardInput,
  permission: "boards:read",
  handler: async (input, ctx) => getBoardCardById(input.boardCardId, ctx.session.userId),
});

export const packageRequirementsAction = boardMutation({
  name: "boards.package",
  schema: packageRequirementsInput,
  permission: "boards:create",
  mutate: packageRequirements,
});
/** Deliverables as cards (ADR-0052): the card dialog's "Deliverable" source. */
export const packageDeliverablesAction = boardMutation({
  name: "boards.packageDeliverables",
  schema: packageDeliverablesInput,
  permission: "boards:create",
  mutate: packageDeliverables,
});

/** The project's deliverables, numbered as the work breakdown numbers them. The read proc asserts
 *  the actor can see the project; packaging asserts it again on write. */
export const readDeliverableOptionsAction = action({
  name: "boards.deliverableOptions",
  schema: z.object({ projectId: z.number().int().positive() }),
  permission: "boards:read",
  handler: (input, ctx) => listDeliverableOptions(input.projectId, ctx.session.userId),
});

export const readPackagingOptionsAction = action({
  name: "boards.packageOptions",
  schema: z.object({ projectId: z.number().int().positive() }),
  permission: "boards:read",
  handler: async (input, ctx) => {
    const [requirements, boards] = await Promise.all([
      listPackagingRequirementOptions(input.projectId, ctx.session.userId),
      listBoardOptions(ctx.session.userId),
    ]);
    return {
      requirements,
      boards: boards.filter((b) => b.ProjectId === null || b.ProjectId === input.projectId),
    };
  },
});
export const readPackagingBoardAction = action({
  name: "boards.packageColumns",
  schema: z.object({ boardId: z.number().int().positive() }),
  permission: "boards:read",
  handler: async (input, ctx) => {
    const board = await getBoard({ boardId: input.boardId, cardsPerList: 1 }, ctx.session.userId);
    return { columns: board.columns, activeSprintId: board.header.ActiveSprintId };
  },
});
