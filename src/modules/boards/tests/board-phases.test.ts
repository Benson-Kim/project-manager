import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  createBoardPhase,
  deleteBoardPhase,
  moveBoardPhase,
  updateBoardPhase,
} from "../repository/board-phases";
import {
  createBoardPhaseInput,
  deleteBoardPhaseInput,
  moveBoardPhaseInput,
  updateBoardPhaseInput,
} from "../schemas/board-phase";

const ACTOR = 7;

const phaseDbRow = {
  BoardPhaseId: 4,
  BoardId: 3,
  Name: "Discovery",
  StartDate: new Date("2026-11-01T00:00:00Z"),
  EndDate: new Date("2026-11-28T00:00:00Z"),
  SortOrder: 1,
  RowVer: "9",
};

/** The parameter names the repository sent on its last call. */
const lastParams = () => Object.keys(execProc.mock.calls.at(-1)![1] as object).sort();

beforeEach(() => {
  execProc.mockReset();
  execProc.mockResolvedValue([phaseDbRow]);
});

describe("board phase contracts drop the fields the server owns", () => {
  it("a create carries only the board, name and dates", () => {
    const parsed = createBoardPhaseInput.parse({
      boardId: 3,
      name: "  Discovery  ",
      startDate: "2026-11-01",
      endDate: "2026-11-28",
      boardPhaseId: 99,
      sortOrder: 1,
      createdBy: 1,
      rowVer: 5,
      isDeleted: false,
    });
    expect(parsed.name).toBe("Discovery");
    expect(Object.keys(parsed).sort()).toEqual(["boardId", "endDate", "name", "startDate"]);
  });

  it("an update never carries a board, because a phase never changes board", () => {
    const parsed = updateBoardPhaseInput.parse({
      boardPhaseId: 4,
      rowVer: 9,
      name: "Discovery",
      startDate: null,
      endDate: null,
      boardId: 12,
      sortOrder: 4,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "boardPhaseId",
      "endDate",
      "name",
      "rowVer",
      "startDate",
    ]);
  });

  it("an edit never carries a sort order: ordering is its own intention", () => {
    const parsed = updateBoardPhaseInput.parse({
      boardPhaseId: 4,
      rowVer: 9,
      name: "Discovery",
      sortOrder: 2,
    });
    expect(parsed).not.toHaveProperty("sortOrder");
  });

  it("takes either date alone, because a phase can be named before it is dated", () => {
    const parsed = createBoardPhaseInput.parse({ boardId: 3, name: "Discovery" });
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
  });

  it("refuses a name longer than the column holds", () => {
    expect(() => createBoardPhaseInput.parse({ boardId: 3, name: "x".repeat(101) })).toThrow();
  });

  it("refuses an empty name, however much whitespace it is made of", () => {
    expect(() => createBoardPhaseInput.parse({ boardId: 3, name: "   " })).toThrow();
  });

  it("a move carries only the phase, the direction and the version", () => {
    const parsed = moveBoardPhaseInput.parse({
      boardPhaseId: 4,
      direction: "up",
      rowVer: 9,
      sortOrder: 1,
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardPhaseId", "direction", "rowVer"]);
  });

  it("refuses a direction that is not up or down", () => {
    expect(() =>
      moveBoardPhaseInput.parse({ boardPhaseId: 4, direction: "sideways", rowVer: 9 }),
    ).toThrow();
  });

  it("a delete carries no target, because the sprints are released rather than moved", () => {
    const parsed = deleteBoardPhaseInput.parse({
      boardPhaseId: 4,
      rowVer: 9,
      targetPhaseId: 5,
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardPhaseId", "rowVer"]);
  });
});

describe("the board phase repository sends exactly the parameters each proc declares", () => {
  it("creates a phase", async () => {
    await createBoardPhase(
      { boardId: 3, name: "Discovery", startDate: "2026-11-01", endDate: "2026-11-28" },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardPhase_Create");
    expect(lastParams()).toEqual(["ActorUserId", "BoardId", "EndDate", "Name", "StartDate"]);
  });

  it("sends a null rather than undefined for a phase with no dates", async () => {
    await createBoardPhase({ boardId: 3, name: "Discovery" }, ACTOR);
    const params = execProc.mock.calls[0][1] as Record<string, unknown>;
    expect(params.StartDate).toBeNull();
    expect(params.EndDate).toBeNull();
  });

  it("updates a phase without naming its board", async () => {
    await updateBoardPhase(
      { boardPhaseId: 4, rowVer: 9, name: "Discovery", startDate: null, endDate: null },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardPhase_Update");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BoardPhaseId",
      "EndDate",
      "Name",
      "RowVer",
      "StartDate",
    ]);
  });

  it("moves a phase one place", async () => {
    await moveBoardPhase({ boardPhaseId: 4, direction: "down", rowVer: 9 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardPhase_Move");
    expect(lastParams()).toEqual(["ActorUserId", "BoardPhaseId", "Direction", "RowVer"]);
  });

  it("deletes a phase and reports how many sprints it released", async () => {
    execProc.mockResolvedValue([{ ReleasedSprints: 3 }]);
    const result = await deleteBoardPhase({ boardPhaseId: 4, rowVer: 9 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardPhase_Delete");
    expect(lastParams()).toEqual(["ActorUserId", "BoardPhaseId", "RowVer"]);
    expect(result.ReleasedSprints).toBe(3);
  });

  it("coerces the row version the driver returns as a string", async () => {
    const row = await createBoardPhase({ boardId: 3, name: "Discovery" }, ACTOR);
    expect(row.RowVer).toBe(9);
  });
});
