import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createBoard,
  deleteBoard,
  getBoardById,
  listBoardOptions,
  listBoards,
  updateBoard,
} from "../repository/boards";
import {
  boardColumnDraftInput,
  createBoardInput,
  updateBoardInput,
  type CreateBoardInput,
} from "../schemas/board";
import {
  COLUMN_CATEGORIES,
  MAX_BOARD_COLUMNS,
  SPRINT_STATES,
  defaultBoardColumns,
} from "../schemas/board-rules";

const ACTOR = 7;

const boardDbRow = {
  BoardId: 3,
  ProjectId: 2,
  Name: "Delivery",
  Description: null,
  CreatedBy: 7,
  CreatedAtUtc: new Date("2026-10-22T09:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "41",
};

const validInput = (): CreateBoardInput => ({
  projectId: 2,
  name: "Delivery",
  description: null,
  columns: defaultBoardColumns(),
});

/** The parameter names the repository sent on its last call. */
const lastParams = () => Object.keys(execProc.mock.calls.at(-1)![1] as object).sort();

beforeEach(() => {
  execProc.mockReset();
  execProc.mockResolvedValue([{ ...boardDbRow, ProjectName: "Alpha", ActorAccess: "Manager" }]);
});

describe("board rules", () => {
  it("starts a board with one column per stage of the flow", () => {
    expect(defaultBoardColumns().map((c) => c.category)).toEqual([...COLUMN_CATEGORIES]);
  });

  it("names the starting columns from the copy, so SQL holds no interface text", () => {
    for (const column of defaultBoardColumns()) {
      expect(column.name.length).toBeGreaterThan(0);
      expect(column.wipLimit).toBeNull();
    }
  });

  it("moves a sprint forward only", () => {
    expect(SPRINT_STATES).toEqual(["planned", "active", "completed"]);
  });
});

describe("board contracts", () => {
  it("trims a name and refuses an empty one", () => {
    expect(createBoardInput.parse({ ...validInput(), name: "  Delivery  " }).name).toBe("Delivery");
    expect(createBoardInput.safeParse({ ...validInput(), name: "   " }).success).toBe(false);
  });

  it("refuses a board with no columns, or more than the proc accepts", () => {
    expect(createBoardInput.safeParse({ ...validInput(), columns: [] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_BOARD_COLUMNS + 1 }, (_, i) => ({
      name: `C${i}`,
      category: "todo" as const,
      wipLimit: null,
    }));
    expect(createBoardInput.safeParse({ ...validInput(), columns: tooMany }).success).toBe(false);
  });

  it("refuses a column category or a limit the CHECK constraints would reject", () => {
    expect(
      boardColumnDraftInput.safeParse({ name: "X", category: "archive", wipLimit: null }).success,
    ).toBe(false);
    expect(
      boardColumnDraftInput.safeParse({ name: "X", category: "todo", wipLimit: 0 }).success,
    ).toBe(false);
    expect(
      boardColumnDraftInput.safeParse({ name: "X", category: "todo", wipLimit: 1000 }).success,
    ).toBe(false);
  });

  it("drops fields the server owns instead of carrying them into a write", () => {
    const parsed = createBoardInput.parse({
      ...validInput(),
      boardId: 99,
      createdBy: 1,
      rowVer: 5,
      isDeleted: false,
    });
    expect(Object.keys(parsed).sort()).toEqual(["columns", "description", "name", "projectId"]);
  });

  it("never lets an update carry a project, because linking a board is its own intention", () => {
    const parsed = updateBoardInput.parse({
      boardId: 3,
      rowVer: 41,
      name: "Delivery",
      description: null,
      projectId: 9,
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardId", "description", "name", "rowVer"]);
  });
});

describe("board repository sends exactly the parameters each proc declares", () => {
  it("usp_Board_Create", async () => {
    await createBoard({ ...validInput(), boardId: 99, createdBy: 1 } as CreateBoardInput, ACTOR);
    expect(execProc).toHaveBeenCalledTimes(1);
    expect(execProc.mock.calls[0][0]).toBe("usp_Board_Create");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "ColumnsJson",
      "Description",
      "Name",
      "ProjectId",
    ]);
    const params = execProc.mock.calls[0][1] as { ColumnsJson: string; ActorUserId: number };
    expect(params.ActorUserId).toBe(ACTOR);
    expect(JSON.parse(params.ColumnsJson)).toHaveLength(3);
  });

  it("usp_Board_Update", async () => {
    execProc.mockResolvedValue([boardDbRow]);
    await updateBoard({ boardId: 3, rowVer: 41, name: "Delivery", description: null }, ACTOR);
    expect(lastParams()).toEqual(["ActorUserId", "BoardId", "Description", "Name", "RowVer"]);
  });

  it("usp_Board_Delete", async () => {
    execProc.mockResolvedValue([]);
    await deleteBoard(3, 41, ACTOR);
    expect(lastParams()).toEqual(["ActorUserId", "BoardId", "RowVer"]);
  });

  it("usp_Board_GetById", async () => {
    await getBoardById(3, ACTOR);
    expect(lastParams()).toEqual(["ActorUserId", "BoardId"]);
  });

  it("usp_Board_List forwards the list contract and its one filter", async () => {
    execProc.mockResolvedValue([
      { ...boardDbRow, ProjectName: "Alpha", TotalCount: 1, ActorAccess: "Manager" },
    ]);
    await listBoards(listParamsSchema.parse({}), ACTOR, 2, 25, { withoutProject: true });
    expect(lastParams()).toEqual([
      "ActorUserId",
      "Page",
      "PageSize",
      "ProjectId",
      "Search",
      "SortBy",
      "SortDir",
      "WithoutProject",
    ]);
  });

  it("usp_Board_ListOptions", async () => {
    execProc.mockResolvedValue([
      { BoardId: 3, Name: "Delivery", ProjectId: 2, ProjectName: "Alpha", ActorAccess: "Viewer" },
    ]);
    await listBoardOptions(ACTOR, 2, "del");
    expect(lastParams()).toEqual(["ActorUserId", "ProjectId", "Search", "WithoutProject"]);
  });

  it("reads the row version the driver returns as a string", async () => {
    execProc.mockResolvedValue([boardDbRow]);
    const row = await updateBoard(
      { boardId: 3, rowVer: 41, name: "Delivery", description: null },
      ACTOR,
    );
    expect(row.RowVer).toBe(41);
  });
});
