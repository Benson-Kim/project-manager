import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { createBoardColumn, moveBoardColumn, updateBoardColumn } from "../repository/board-columns";
import {
  createBoardColumnInput,
  moveBoardColumnInput,
  updateBoardColumnInput,
} from "../schemas/board-column";

const ACTOR = 7;

const columnDbRow = {
  BoardColumnId: 10,
  BoardId: 3,
  Name: "In review",
  Category: "doing",
  WipLimit: 5,
  SortOrder: 2,
  RowVer: "7",
};

/** The parameter names the repository sent on its last call. */
const lastParams = () => Object.keys(execProc.mock.calls.at(-1)![1] as object).sort();

beforeEach(() => {
  execProc.mockReset();
  execProc.mockResolvedValue([columnDbRow]);
});

describe("board column contracts drop the fields the server owns", () => {
  it("a create carries only the board, name, category and limit", () => {
    const parsed = createBoardColumnInput.parse({
      boardId: 3,
      name: "  In review  ",
      category: "doing",
      wipLimit: 5,
      boardColumnId: 99,
      sortOrder: 1,
      createdBy: 1,
      rowVer: 5,
      isDeleted: false,
    });
    expect(parsed.name).toBe("In review");
    expect(Object.keys(parsed).sort()).toEqual(["boardId", "category", "name", "wipLimit"]);
  });

  it("an update never carries a board, because a column never changes board", () => {
    const parsed = updateBoardColumnInput.parse({
      boardColumnId: 10,
      rowVer: 7,
      name: "In review",
      category: "doing",
      wipLimit: null,
      boardId: 9,
      sortOrder: 4,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "boardColumnId",
      "category",
      "name",
      "rowVer",
      "wipLimit",
    ]);
  });

  it("refuses a category or a limit the CHECK constraints would reject", () => {
    expect(
      createBoardColumnInput.safeParse({
        boardId: 3,
        name: "X",
        category: "archive",
        wipLimit: null,
      }).success,
    ).toBe(false);
    expect(
      createBoardColumnInput.safeParse({ boardId: 3, name: "X", category: "todo", wipLimit: 0 })
        .success,
    ).toBe(false);
    expect(
      createBoardColumnInput.safeParse({ boardId: 3, name: "X", category: "todo", wipLimit: 1000 })
        .success,
    ).toBe(false);
  });

  it("reorders one place at a time and nowhere else", () => {
    expect(
      moveBoardColumnInput.safeParse({ boardColumnId: 10, direction: "up", rowVer: 7 }).success,
    ).toBe(true);
    expect(
      moveBoardColumnInput.safeParse({ boardColumnId: 10, direction: "top", rowVer: 7 }).success,
    ).toBe(false);
  });
});

describe("board column repository sends exactly the parameters each proc declares", () => {
  it("usp_BoardColumn_Create, even when the payload carries server-owned keys", async () => {
    await createBoardColumn(
      {
        boardId: 3,
        name: "In review",
        category: "doing",
        wipLimit: 5,
        boardColumnId: 99,
        sortOrder: 1,
      } as never,
      ACTOR,
    );
    expect(execProc).toHaveBeenCalledTimes(1);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardColumn_Create");
    expect(lastParams()).toEqual(["ActorUserId", "BoardId", "Category", "Name", "WipLimit"]);
    expect((execProc.mock.calls[0][1] as { ActorUserId: number }).ActorUserId).toBe(ACTOR);
  });

  it("usp_BoardColumn_Update", async () => {
    await updateBoardColumn(
      { boardColumnId: 10, rowVer: 7, name: "In review", category: "doing", wipLimit: null },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardColumn_Update");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BoardColumnId",
      "Category",
      "Name",
      "RowVer",
      "WipLimit",
    ]);
  });

  it("usp_BoardColumn_Move", async () => {
    await moveBoardColumn({ boardColumnId: 10, direction: "down", rowVer: 7 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardColumn_Move");
    expect(lastParams()).toEqual(["ActorUserId", "BoardColumnId", "Direction", "RowVer"]);
  });

  it("reads the row version the driver returns as a string", async () => {
    const row = await createBoardColumn(
      { boardId: 3, name: "In review", category: "doing", wipLimit: 5 },
      ACTOR,
    );
    expect(row.RowVer).toBe(7);
  });
});
