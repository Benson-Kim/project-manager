import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { getTodoRecurrence } from "../repository/todo-recurrence";

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
