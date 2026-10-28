import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action";
import type { Session } from "@/lib/auth/types";
import { AppError } from "@/lib/errors";

const revalidatePath = vi.fn();
const execProc = vi.fn();
const execProcSets = vi.fn();
let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args),
  execProcSets: (...args: unknown[]) => execProcSets(...args),
}));
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: async () => session,
    requireSession: async () => {
      if (!session) throw new AppError("UNAUTHENTICATED", "Sign in");
      return session;
    },
  },
}));
import * as actions from "../actions";
const date = new Date("2026-10-28T00:00:00Z");
const row = {
  BoardId: 3,
  ProjectId: 2,
  ProjectName: "Alpha",
  Name: "Delivery",
  Description: null,
  CreatedBy: 7,
  CreatedAtUtc: date,
  UpdatedAtUtc: null,
  RowVer: "41",
  ActorAccess: "Manager",
  ActorGrants: null,
  ActorRevokes: null,
  Stamp: "99",
  ActiveSprintId: null,
  BacklogCount: 0,
  BoardCardId: 11,
  BoardColumnId: 4,
  BoardSprintId: 5,
  BoardPhaseId: 6,
  Title: "Task",
  AssigneeUserId: null,
  DueDate: null,
  StoryPoints: null,
  Color: null,
  SortKey: "1048576",
  RequirementId: null,
  RequirementState: "none",
  RequirementType: null,
  RequirementNumber: null,
  RequirementRef: null,
  RequirementText: null,
  RequirementIsMet: null,
  RequirementProjectId: null,
  Notes: null,
  AssigneeName: null,
  Category: "todo",
  WipLimit: null,
  SortOrder: 1,
  StartDate: date,
  EndDate: date,
  State: "planned",
  Goal: null,
  StartedAtUtc: null,
  CompletedAtUtc: null,
  MovedCards: 0,
  MovedToColumnId: 4,
  ReleasedSprints: 0,
  KeptCards: 0,
  MovedToSprintId: null,
  CardsToBacklog: 0,
  RemovedCards: 0,
  AddedCards: 2,
  SkippedCards: 0,
};
const cardValues = {
  title: "Task",
  notes: null,
  assigneeUserId: null,
  dueDate: null,
  storyPoints: null,
  color: null,
};
const cardParams = {
  Title: "Task",
  Notes: null,
  AssigneeUserId: null,
  DueDate: null,
  StoryPoints: null,
  Color: null,
};
const dates = { startDate: date, endDate: date };
const dateParams = { StartDate: date, EndDate: date };
interface Case {
  name: string;
  call: (input: unknown) => Promise<ActionResult<unknown>>;
  input: Record<string, unknown>;
  proc: string;
  params: Record<string, unknown>;
}
const cases: Case[] = [
  {
    name: "create card",
    call: actions.createBoardCardAction,
    input: { boardId: 3, boardColumnId: 4, ...cardValues },
    proc: "usp_BoardCard_Create",
    params: { BoardId: 3, BoardColumnId: 4, BoardSprintId: null, ...cardParams },
  },
  {
    name: "update card",
    call: actions.updateBoardCardAction,
    input: { boardCardId: 11, rowVer: 41, ...cardValues },
    proc: "usp_BoardCard_Update",
    params: { BoardCardId: 11, RowVer: 41, ...cardParams },
  },
  {
    name: "move card",
    call: actions.moveBoardCardAction,
    input: {
      boardCardId: 11,
      rowVer: 41,
      toColumnId: 4,
      toSprintId: 5,
      sprintSet: true,
      beforeCardId: 12,
    },
    proc: "usp_BoardCard_Move",
    params: {
      BoardCardId: 11,
      RowVer: 41,
      ToColumnId: 4,
      ToSprintId: 5,
      SprintSet: true,
      BeforeCardId: 12,
    },
  },
  {
    name: "delete card",
    call: actions.deleteBoardCardAction,
    input: { boardCardId: 11, rowVer: 41 },
    proc: "usp_BoardCard_Delete",
    params: { BoardCardId: 11, RowVer: 41 },
  },
  {
    name: "create column",
    call: actions.createBoardColumnAction,
    input: { boardId: 3, name: "Ready", category: "todo", wipLimit: 2 },
    proc: "usp_BoardColumn_Create",
    params: { BoardId: 3, Name: "Ready", Category: "todo", WipLimit: 2 },
  },
  {
    name: "update column",
    call: actions.updateBoardColumnAction,
    input: { boardColumnId: 4, rowVer: 41, name: "Ready", category: "doing", wipLimit: null },
    proc: "usp_BoardColumn_Update",
    params: { BoardColumnId: 4, RowVer: 41, Name: "Ready", Category: "doing", WipLimit: null },
  },
  {
    name: "move column",
    call: actions.moveBoardColumnAction,
    input: { boardColumnId: 4, rowVer: 41, direction: "up" },
    proc: "usp_BoardColumn_Move",
    params: { BoardColumnId: 4, RowVer: 41, Direction: "up" },
  },
  {
    name: "delete column",
    call: actions.deleteBoardColumnAction,
    input: { boardColumnId: 4, rowVer: 41, targetColumnId: 8 },
    proc: "usp_BoardColumn_Delete",
    params: { BoardColumnId: 4, RowVer: 41, TargetColumnId: 8 },
  },
  {
    name: "create phase",
    call: actions.createBoardPhaseAction,
    input: { boardId: 3, name: "Release", ...dates },
    proc: "usp_BoardPhase_Create",
    params: { BoardId: 3, Name: "Release", ...dateParams },
  },
  {
    name: "update phase",
    call: actions.updateBoardPhaseAction,
    input: { boardPhaseId: 6, rowVer: 41, name: "Release", ...dates },
    proc: "usp_BoardPhase_Update",
    params: { BoardPhaseId: 6, RowVer: 41, Name: "Release", ...dateParams },
  },
  {
    name: "move phase",
    call: actions.moveBoardPhaseAction,
    input: { boardPhaseId: 6, rowVer: 41, direction: "down" },
    proc: "usp_BoardPhase_Move",
    params: { BoardPhaseId: 6, RowVer: 41, Direction: "down" },
  },
  {
    name: "delete phase",
    call: actions.deleteBoardPhaseAction,
    input: { boardPhaseId: 6, rowVer: 41 },
    proc: "usp_BoardPhase_Delete",
    params: { BoardPhaseId: 6, RowVer: 41 },
  },
  {
    name: "create sprint",
    call: actions.createBoardSprintAction,
    input: { boardId: 3, name: "Sprint", ...dates, boardPhaseId: 6, goal: "Ship" },
    proc: "usp_BoardSprint_Create",
    params: { BoardId: 3, Name: "Sprint", ...dateParams, BoardPhaseId: 6, Goal: "Ship" },
  },
  {
    name: "update sprint",
    call: actions.updateBoardSprintAction,
    input: { boardSprintId: 5, rowVer: 41, name: "Sprint", ...dates, boardPhaseId: 6, goal: null },
    proc: "usp_BoardSprint_Update",
    params: {
      BoardSprintId: 5,
      RowVer: 41,
      Name: "Sprint",
      ...dateParams,
      BoardPhaseId: 6,
      Goal: null,
    },
  },
  {
    name: "start sprint",
    call: actions.startBoardSprintAction,
    input: { boardSprintId: 5, rowVer: 41 },
    proc: "usp_BoardSprint_Start",
    params: { BoardSprintId: 5, RowVer: 41 },
  },
  {
    name: "complete sprint",
    call: actions.completeBoardSprintAction,
    input: { boardSprintId: 5, rowVer: 41, unfinishedToSprintId: 9 },
    proc: "usp_BoardSprint_Complete",
    params: { BoardSprintId: 5, RowVer: 41, UnfinishedToSprintId: 9 },
  },
  {
    name: "delete sprint",
    call: actions.deleteBoardSprintAction,
    input: { boardSprintId: 5, rowVer: 41 },
    proc: "usp_BoardSprint_Delete",
    params: { BoardSprintId: 5, RowVer: 41 },
  },
  {
    name: "set project",
    call: actions.setBoardProjectAction,
    input: { boardId: 3, rowVer: 41, projectId: 2, removeForeignCards: true },
    proc: "usp_Board_SetProject",
    params: { BoardId: 3, RowVer: 41, ProjectId: 2, RemoveForeignCards: true },
  },
  {
    name: "package",
    call: actions.packageRequirementsAction,
    input: { boardId: 3, boardColumnId: 4, requirementIds: [21, 22] },
    proc: "usp_BoardCard_Package",
    params: { BoardId: 3, BoardColumnId: 4, BoardSprintId: null, RequirementIds: "[21,22]" },
  },
];
beforeEach(() => {
  session = { userId: 7, username: "pm", role: "User" };
  execProc.mockReset().mockResolvedValue([row]);
  execProcSets.mockReset().mockResolvedValue([[row], [], [], [], []]);
  revalidatePath.mockReset();
});
describe.each(cases)("$name action", ({ call, input, proc, params }) => {
  it("pins the exact proc arguments and refreshes both route trees once", async () => {
    const result = await call({
      ...input,
      createdBy: 999,
      actorUserId: 999,
      sortKey: 999,
      requirementId: 999,
      state: "completed",
      isDeleted: true,
    });
    expect(result.ok).toBe(true);
    expect(execProc.mock.calls).toEqual([[proc, { ...params, ActorUserId: 7 }]]);
    expect(revalidatePath.mock.calls).toEqual([
      ["/boards", "layout"],
      ["/projects/[id]/boards", "layout"],
    ]);
  });
  it("rejects invalid input before any database call or revalidation", async () => {
    expect(await call({})).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(execProc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("requires a session", async () => {
    session = null;
    expect(await call(input)).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(execProc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN_ROW", "CONFLICT", "LIMIT_REACHED"] as const)(
    "maps %s without refreshing failed writes",
    async (code) => {
      execProc.mockRejectedValue(new AppError(code, "Database refusal"));
      expect(await call(input)).toMatchObject({ ok: false, error: { code } });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
describe("board UI reads", () => {
  it("reads card details with a read schema, without write arguments or revalidation", async () => {
    expect(
      (await actions.readBoardCardAction({ boardCardId: 11, rowVer: 99, createdBy: 1 })).ok,
    ).toBe(true);
    expect(execProc.mock.calls).toEqual([
      ["usp_BoardCard_GetById", { BoardCardId: 11, ActorUserId: 7 }],
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("uses all-type packaging options and filters out boards of other projects", async () => {
    execProc.mockImplementation(async (proc) =>
      proc === "usp_Requirement_ListPackagingOptions"
        ? [
            {
              RequirementId: 21,
              RequirementType: "FR",
              Ref: "FR-2.1",
              Requirement: "Functional work",
            },
          ]
        : [row, { ...row, BoardId: 8, ProjectId: null }, { ...row, BoardId: 9, ProjectId: 10 }],
    );
    const result = await actions.readPackagingOptionsAction({ projectId: 2 });
    expect(result).toMatchObject({
      ok: true,
      data: { requirements: [{ id: 21, ref: "FR-2.1" }], boards: [{ BoardId: 3 }, { BoardId: 8 }] },
    });
    expect(execProc.mock.calls).toEqual([
      ["usp_Requirement_ListPackagingOptions", { ProjectId: 2, ActorUserId: 7 }],
      [
        "usp_Board_ListOptions",
        { ActorUserId: 7, ProjectId: null, Search: null, WithoutProject: false },
      ],
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("loads only one card per lane when reading destination columns", async () => {
    expect(await actions.readPackagingBoardAction({ boardId: 3 })).toEqual({
      ok: true,
      data: { columns: [], activeSprintId: null },
    });
    expect(execProcSets.mock.calls).toEqual([
      [
        "usp_Board_GetBoard",
        {
          BoardId: 3,
          ActorUserId: 7,
          View: "board",
          CardsPerList: 1,
          Search: null,
          SprintId: null,
        },
      ],
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each([
    [actions.readBoardCardAction, { boardCardId: 11 }],
    [actions.readPackagingOptionsAction, { projectId: 2 }],
    [actions.readPackagingBoardAction, { boardId: 3 }],
  ])("requires a session for each read", async (call, input) => {
    session = null;
    expect(await call(input)).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(execProc).not.toHaveBeenCalled();
    expect(execProcSets).not.toHaveBeenCalled();
  });
});
