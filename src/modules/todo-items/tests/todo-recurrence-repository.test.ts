import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
const execProcSets = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: (...args: unknown[]) => execProcSets(...args) as Promise<unknown[][]>,
}));

import { getTodoRecurrence, listTodoCalendar } from "../repository/todo-recurrence";

describe("getTodoRecurrence", () => {
  beforeEach(() => execProc.mockReset());

  it("reads one to-do's rule for the actor", async () => {
    execProc.mockResolvedValue([
      {
        TodoItemId: 4,
        RepeatUnit: "Month",
        RepeatEvery: 1,
        StartTime: null,
        Weekdays: null,
        MonthMode: "NthWeekday",
        Ordinal: -1,
        Weekday: 5,
        EndsOn: new Date("2027-06-30T00:00:00Z"),
        EndsAfter: null,
        RowVer: "21",
      },
    ]);
    expect(await getTodoRecurrence(4, 7)).toEqual({
      todoItemId: 4,
      rowVer: 21,
      rule: {
        unit: "Month",
        every: 1,
        startTime: null,
        weekdays: null,
        monthMode: "NthWeekday",
        ordinal: -1,
        weekday: 5,
        endsOn: "2027-06-30",
        endsAfter: null,
      },
    });
    expect(execProc).toHaveBeenCalledWith("usp_TodoRecurrence_GetById", {
      TodoItemId: 4,
      ActorUserId: 7,
    });
  });

  it("returns null for a to-do that does not repeat", async () => {
    execProc.mockResolvedValue([]);
    expect(await getTodoRecurrence(4, 7)).toBeNull();
  });
});

describe("listTodoCalendar", () => {
  beforeEach(() => execProcSets.mockReset());

  const listed = {
    TodoItemId: 4,
    ProjectId: 2,
    ProjectName: "Bridge",
    TodoItem: "Inspect",
    StartDate: new Date("2026-10-30T00:00:00Z"),
    DueDate: null,
    Priority: "High",
    Notes: null,
    Status: "Not Started",
    Assignee: "Ann",
    RowVer: "11",
    ActorAccess: "Contributor",
  };
  const noRule = {
    RepeatUnit: null,
    RepeatEvery: null,
    StartTime: null,
    Weekdays: null,
    MonthMode: null,
    Ordinal: null,
    Weekday: null,
    EndsOn: null,
    EndsAfter: null,
  };

  it("reads the window's to-dos with their rules, and its occurrence rows", async () => {
    execProcSets.mockResolvedValue([
      [
        { ...listed, ...noRule },
        { ...listed, TodoItemId: 5, ...noRule, RepeatUnit: "Day", RepeatEvery: 2 },
      ],
      [
        {
          TodoOccurrenceId: 8,
          TodoItemId: 5,
          OccursAt: new Date("2026-11-03T00:00:00Z"),
          Status: null,
          MovedTo: new Date("2026-11-04T00:00:00Z"),
          IsSkipped: false,
          RowVer: "12",
        },
      ],
    ]);
    const r = await listTodoCalendar({ projectId: null, from: "2026-10-26", to: "2026-12-06" }, 7);
    expect(execProcSets).toHaveBeenCalledWith("usp_Todo_ListCalendar", {
      ActorUserId: 7,
      ProjectId: null,
      From: "2026-10-26",
      To: "2026-12-06",
    });
    expect(r.todos.map((t) => [t.todoItemId, t.startDate, t.rowVer, t.actorAccess])).toEqual([
      [4, "2026-10-30", 11, "Contributor"],
      [5, "2026-10-30", 11, "Contributor"],
    ]);
    expect(r.todos[0]?.rule).toBeNull();
    expect(r.todos[1]?.rule).toMatchObject({ unit: "Day", every: 2, endsOn: null });
    expect(r.occurrences).toEqual([
      {
        todoOccurrenceId: 8,
        todoItemId: 5,
        occursAt: "2026-11-03T00:00:00",
        status: null,
        movedTo: "2026-11-04T00:00:00",
        isSkipped: false,
        rowVer: 12,
      },
    ]);
  });

  it("reads an empty window", async () => {
    execProcSets.mockResolvedValue([]);
    expect(
      await listTodoCalendar({ projectId: 2, from: "2026-11-01", to: "2026-11-30" }, 7),
    ).toEqual({ todos: [], occurrences: [] });
  });

  it.each([
    ["ends before it starts", { from: "2026-11-02", to: "2026-11-01" }],
    ["is longer than 62 days", { from: "2026-11-01", to: "2027-01-02" }],
    ["is not a date", { from: "2026-11", to: "2026-11-30" }],
  ])("refuses a window that %s, before the database", async (_, window) => {
    await expect(listTodoCalendar({ projectId: null, ...window }, 7)).rejects.toThrow();
    expect(execProcSets).not.toHaveBeenCalled();
  });
});
