import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  createTodoAlert,
  deleteTodoAlert,
  getTodoAlertById,
  updateTodoAlert,
} from "./todo-alerts";

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    TodoAlertId: 2,
    TodoItemId: 4,
    AlertDay: new Date("2025-12-01T00:00:00Z"),
    AlertTime: "09:00:00",
    RepeatUnit: "Day",
    RepeatInterval: 1,
    CurrentRepeatInterval: null,
    SnoozeCount: 0,
    LastSnoozeTime: null,
    MaxSnoozeCount: 3,
    SnoozeOptions: "5,10,15",
    IsDismissed: false,
    CreatedAtUtc: new Date("2025-06-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "5",
    ...overrides,
  };
}

describe("todo-alerts repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([alertRow()]);
    const row = await createTodoAlert(
      {
        todoItemId: 4,
        isDismissed: false,
        alertDay: new Date("2025-12-01"),
        alertTime: "09:00:00",
        repeatUnit: "Day",
        repeatInterval: 1,
        maxSnoozeCount: 3,
      },
      7,
    );
    expect(row.TodoAlertId).toBe(2);
    expect(row.RowVer).toBe(5);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Create");
    expect(params.TodoItemId).toBe(4);
    expect(params.IsDismissed).toBe(false);
    expect(params.ActorUserId).toBe(7);
  });

  it("create requires todoItemId", async () => {
    await expect(
      createTodoAlert({ todoItemId: 0, isDismissed: false }, 7),
    ).rejects.toThrow();
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([alertRow()]);
    await expect(getTodoAlertById(2, 7)).resolves.toMatchObject({ RepeatUnit: "Day" });
  });

  it("update forwards RowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([alertRow()]);
    await updateTodoAlert(
      { todoAlertId: 2, todoItemId: 4, isDismissed: false, rowVer: 5 },
      7,
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Update");
    expect(params.RowVer).toBe(5);
    expect(params.TodoAlertId).toBe(2);
  });

  it("delete forwards TodoAlertId and RowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteTodoAlert(2, 5, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Delete");
    expect(params.TodoAlertId).toBe(2);
    expect(params.RowVer).toBe(5);
  });
});
