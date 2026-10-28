import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  completeBoardSprint,
  createBoardSprint,
  deleteBoardSprint,
  startBoardSprint,
  updateBoardSprint,
} from "../repository/board-sprints";
import { sprintActions } from "../schemas/board-rules";
import {
  completeBoardSprintInput,
  createBoardSprintInput,
  deleteBoardSprintInput,
  startBoardSprintInput,
  updateBoardSprintInput,
} from "../schemas/board-sprint";

const ACTOR = 7;

const sprintDbRow = {
  BoardSprintId: 8,
  BoardId: 3,
  BoardPhaseId: 4,
  Name: "Sprint 1",
  Goal: "Ship the picker",
  StartDate: new Date("2026-11-01T00:00:00Z"),
  EndDate: new Date("2026-11-14T00:00:00Z"),
  State: "planned",
  StartedAtUtc: null,
  CompletedAtUtc: null,
  RowVer: "11",
};

/** The parameter names the repository sent on its last call. */
const lastParams = () => Object.keys(execProc.mock.calls.at(-1)![1] as object).sort();

beforeEach(() => {
  execProc.mockReset();
  execProc.mockResolvedValue([sprintDbRow]);
});

describe("board sprint contracts never carry the lifecycle", () => {
  it("an edit owns the name, goal, dates and phase, and nothing else", () => {
    const parsed = updateBoardSprintInput.parse({
      boardSprintId: 8,
      rowVer: 11,
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      goal: "Ship the picker",
      boardPhaseId: 4,
      state: "active",
      startedAtUtc: "2026-11-01",
      completedAtUtc: "2026-11-14",
      boardId: 99,
      createdBy: 1,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "boardPhaseId",
      "boardSprintId",
      "endDate",
      "goal",
      "name",
      "rowVer",
      "startDate",
    ]);
  });

  it("a create cannot ask for a sprint that is already running", () => {
    const parsed = createBoardSprintInput.parse({
      boardId: 3,
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      state: "active",
      startedAtUtc: "2026-11-01",
    });
    expect(parsed).not.toHaveProperty("state");
    expect(parsed).not.toHaveProperty("startedAtUtc");
  });

  it("requires both dates, because a sprint is a timebox", () => {
    expect(() =>
      createBoardSprintInput.parse({ boardId: 3, name: "Sprint 1", startDate: "2026-11-01" }),
    ).toThrow();
  });

  it("takes a sprint with no phase, which is the normal case", () => {
    const parsed = createBoardSprintInput.parse({
      boardId: 3,
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });
    expect(parsed.boardPhaseId).toBeUndefined();
  });

  it("refuses a goal longer than the column holds", () => {
    expect(() =>
      createBoardSprintInput.parse({
        boardId: 3,
        name: "Sprint 1",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        goal: "x".repeat(1001),
      }),
    ).toThrow();
  });

  it("a start carries only the sprint and the version the client holds", () => {
    const parsed = startBoardSprintInput.parse({
      boardSprintId: 8,
      rowVer: 11,
      state: "active",
      boardId: 3,
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardSprintId", "rowVer"]);
  });

  it("a complete carries only the sprint, the version and where unfinished work goes", () => {
    const parsed = completeBoardSprintInput.parse({
      boardSprintId: 8,
      rowVer: 11,
      unfinishedToSprintId: 9,
      state: "completed",
      completedAtUtc: "2026-11-14",
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardSprintId", "rowVer", "unfinishedToSprintId"]);
  });

  it("a delete carries no target: a planned sprint's cards always go to the backlog", () => {
    const parsed = deleteBoardSprintInput.parse({
      boardSprintId: 8,
      rowVer: 11,
      unfinishedToSprintId: 9,
    });
    expect(Object.keys(parsed).sort()).toEqual(["boardSprintId", "rowVer"]);
  });
});

describe("the board sprint repository sends exactly the parameters each proc declares", () => {
  it("creates a planned sprint", async () => {
    await createBoardSprint(
      {
        boardId: 3,
        name: "Sprint 1",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        goal: "Ship the picker",
        boardPhaseId: 4,
      },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardSprint_Create");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BoardId",
      "BoardPhaseId",
      "EndDate",
      "Goal",
      "Name",
      "StartDate",
    ]);
  });

  it("sends nulls rather than undefined for an unphased sprint with no goal", async () => {
    await createBoardSprint(
      { boardId: 3, name: "Sprint 1", startDate: "2026-11-01", endDate: "2026-11-14" },
      ACTOR,
    );
    const params = execProc.mock.calls[0][1] as Record<string, unknown>;
    expect(params.Goal).toBeNull();
    expect(params.BoardPhaseId).toBeNull();
  });

  it("updates a sprint without naming its board or its state", async () => {
    await updateBoardSprint(
      {
        boardSprintId: 8,
        rowVer: 11,
        name: "Sprint 1",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
      },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardSprint_Update");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BoardPhaseId",
      "BoardSprintId",
      "EndDate",
      "Goal",
      "Name",
      "RowVer",
      "StartDate",
    ]);
  });

  it("starts a sprint with three parameters and no state", async () => {
    await startBoardSprint({ boardSprintId: 8, rowVer: 11 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardSprint_Start");
    expect(lastParams()).toEqual(["ActorUserId", "BoardSprintId", "RowVer"]);
  });

  it("completes a sprint and reports what stayed and what moved", async () => {
    execProc.mockResolvedValue([{ MovedCards: 3, KeptCards: 12, MovedToSprintId: 9 }]);
    const result = await completeBoardSprint(
      { boardSprintId: 8, rowVer: 11, unfinishedToSprintId: 9 },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardSprint_Complete");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BoardSprintId",
      "RowVer",
      "UnfinishedToSprintId",
    ]);
    expect(result).toEqual({ MovedCards: 3, KeptCards: 12, MovedToSprintId: 9 });
  });

  it("sends a null target, meaning the backlog, when none is chosen", async () => {
    execProc.mockResolvedValue([{ MovedCards: 1, KeptCards: 0, MovedToSprintId: null }]);
    await completeBoardSprint({ boardSprintId: 8, rowVer: 11 }, ACTOR);
    expect((execProc.mock.calls[0][1] as Record<string, unknown>).UnfinishedToSprintId).toBeNull();
  });

  it("deletes a planned sprint and reports how many cards went back to the backlog", async () => {
    execProc.mockResolvedValue([{ CardsToBacklog: 5 }]);
    const result = await deleteBoardSprint({ boardSprintId: 8, rowVer: 11 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardSprint_Delete");
    expect(lastParams()).toEqual(["ActorUserId", "BoardSprintId", "RowVer"]);
    expect(result.CardsToBacklog).toBe(5);
  });

  it("coerces the row version the driver returns as a string", async () => {
    const row = await startBoardSprint({ boardSprintId: 8, rowVer: 11 }, ACTOR);
    expect(row.RowVer).toBe(11);
  });
});

/**
 * sprintActions mirrors what the procs allow, so the interface offers only the steps that would
 * succeed. Each case here pairs with the proc check that enforces it.
 */
describe("sprintActions offers only the lifecycle steps the procs would allow", () => {
  it("offers start on a planned sprint when no sprint is running", () => {
    expect(sprintActions({ BoardSprintId: 8, State: "planned" }, null)).toEqual({
      canEdit: true,
      canStart: true,
      canComplete: false,
      canDelete: true,
    });
  });

  it("withholds start while another sprint is active, as usp_BoardSprint_Start would refuse", () => {
    const actions = sprintActions({ BoardSprintId: 8, State: "planned" }, 9);
    expect(actions.canStart).toBe(false);
    expect(actions.canDelete).toBe(true);
  });

  it("offers complete, not delete, on the active sprint", () => {
    expect(sprintActions({ BoardSprintId: 8, State: "active" }, 8)).toEqual({
      canEdit: true,
      canStart: false,
      canComplete: true,
      canDelete: false,
    });
  });

  it("offers nothing on a completed sprint, which is the record of what was done", () => {
    expect(sprintActions({ BoardSprintId: 8, State: "completed" }, null)).toEqual({
      canEdit: false,
      canStart: false,
      canComplete: false,
      canDelete: false,
    });
  });
});
