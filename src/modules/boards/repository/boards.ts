import { execProc, execProcSets } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  boardCreatedRowSchema,
  boardDetailRowSchema,
  boardListRowSchema,
  boardOptionRowSchema,
  boardRowSchema,
  createBoardInput,
  updateBoardInput,
  type BoardDetailRow,
  type BoardListRow,
  type BoardOptionRow,
  type BoardRow,
  type CreateBoardInput,
  type UpdateBoardInput,
} from "../schemas/board";
import { boardCardListRowSchema } from "../schemas/board-card";
import {
  boardAssigneeRowSchema,
  boardHeaderRowSchema,
  boardPhaseRowSchema,
  boardSprintViewRowSchema,
  boardViewColumnRowSchema,
  getBoardInput,
  type BoardAssigneeRow,
  type BoardView,
  type GetBoardInput,
} from "../schemas/board-view";

/**
 * Board repository — stored procedures only (ADR-0028), rows zod-parsed at the
 * boundary (STANDARDS §2.5), list params forwarded 1:1 (ADR-0016).
 *
 * Every call spells out the parameters it sends. Nothing spreads the caller's
 * input into a proc call, so an extra key in a payload cannot reach the
 * database even if a schema is widened later; src/modules/boards/tests asserts
 * these exact parameter sets.
 */

/** Module-specific filter params forwarded to usp_Board_List. */
export interface BoardListFilters {
  /** Only standalone boards (the cross-project page's "No project" filter). */
  withoutProject?: boolean;
}

export async function listBoards(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: BoardListFilters = {},
): Promise<BoardListRow[]> {
  const rows = await execProc<BoardListRow>("usp_Board_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    WithoutProject: filters.withoutProject ?? false,
  });
  return rows.map((r) => boardListRowSchema.parse(r));
}

export async function listBoardOptions(
  actorUserId: number,
  projectId: number | null = null,
  search: string | null = null,
  filters: BoardListFilters = {},
): Promise<BoardOptionRow[]> {
  const rows = await execProc<BoardOptionRow>("usp_Board_ListOptions", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Search: search,
    WithoutProject: filters.withoutProject ?? false,
  });
  return rows.map((r) => boardOptionRowSchema.parse(r));
}

export async function getBoardById(boardId: number, actorUserId: number): Promise<BoardDetailRow> {
  const rows = await execProc<BoardDetailRow>("usp_Board_GetById", {
    BoardId: boardId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Board not found");
  return boardDetailRowSchema.parse(rows[0]);
}

export async function createBoard(input: CreateBoardInput, actorUserId: number) {
  const parsed = createBoardInput.parse(input);
  const rows = await execProc("usp_Board_Create", {
    ProjectId: parsed.projectId,
    Name: parsed.name,
    Description: parsed.description ?? null,
    // The proc reads every value out of this array and checks it before inserting.
    ColumnsJson: JSON.stringify(parsed.columns),
    ActorUserId: actorUserId,
  });
  return boardCreatedRowSchema.parse(rows[0]);
}

export async function updateBoard(input: UpdateBoardInput, actorUserId: number): Promise<BoardRow> {
  const parsed = updateBoardInput.parse(input);
  const rows = await execProc<BoardRow>("usp_Board_Update", {
    BoardId: parsed.boardId,
    RowVer: parsed.rowVer,
    Name: parsed.name,
    Description: parsed.description ?? null,
    ActorUserId: actorUserId,
  });
  return boardRowSchema.parse(rows[0]);
}

export async function deleteBoard(
  boardId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Board_Delete", {
    BoardId: boardId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/**
 * The whole board in one round trip: usp_Board_GetBoard returns five result
 * sets through execProcSets (ADR-0028 §8 — note that `execProc reads only the
 * first recordset` describes execProc, not this). Each set is parsed with its
 * own schema, so a column the proc stops returning fails here rather than
 * reaching a view as undefined.
 */
export async function getBoard(input: GetBoardInput, actorUserId: number): Promise<BoardView> {
  const parsed = getBoardInput.parse(input);
  const sets = await execProcSets("usp_Board_GetBoard", {
    BoardId: parsed.boardId,
    ActorUserId: actorUserId,
    View: parsed.view,
    CardsPerList: parsed.cardsPerList,
    Search: parsed.search ?? null,
    SprintId: parsed.sprintId ?? null,
  });

  const header = sets[0]?.[0];
  if (!header) throw new AppError("NOT_FOUND", "Board not found");

  return {
    header: boardHeaderRowSchema.parse(header),
    columns: (sets[1] ?? []).map((r) => boardViewColumnRowSchema.parse(r)),
    phases: (sets[2] ?? []).map((r) => boardPhaseRowSchema.parse(r)),
    sprints: (sets[3] ?? []).map((r) => boardSprintViewRowSchema.parse(r)),
    cards: (sets[4] ?? []).map((r) => boardCardListRowSchema.parse(r)),
  };
}

/** The people a card on this board may be assigned to (the card sheet's picker). */
export async function listBoardAssignees(
  boardId: number,
  actorUserId: number,
  search: string | null = null,
): Promise<BoardAssigneeRow[]> {
  const rows = await execProc<BoardAssigneeRow>("usp_Board_ListAssignees", {
    BoardId: boardId,
    ActorUserId: actorUserId,
    Search: search,
  });
  return rows.map((r) => boardAssigneeRowSchema.parse(r));
}
