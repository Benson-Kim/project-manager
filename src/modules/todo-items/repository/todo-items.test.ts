import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createTodoItem,
  deleteTodoItem,
  getTodoItemById,
  getUpcomingAlertRows,
  listTodoItems,
  updateTodoItem,
} from "./todo-items";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    TodoItemId: 4,
    ProjectId: 3,
    DailyActivityId: null,
    ProjectOrActivity: "Project",
    TodoItem: "Review deliverables",
    StartDate: null,
    DueDate: new Date("2025-12-31T00:00:00Z"),
    Priority: "High",
    Status: "Not Started",
    Notes: null,
    CreatedAtUtc: new Date("2025-06-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "20",
    ...overrides,
  };
}

describe("todo-items repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a todoItem string", async () => {
    await expect(createTodoItem({ projectId: 3, todoItem: "  " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createTodoItem({ projectId: 3, todoItem: "Review deliverables" }, 7);
    expect(row.TodoItemId).toBe(4);
    expect(row.RowVer).toBe(20);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Create");
    expect(params.ProjectId).toBe(3);
    expect(params.TodoItem).toBe("Review deliverables");
    expect(params.ActorUserId).toBe(7);
  });

  it("create accepts null projectId (project-unscoped)", async () => {
    execProc.mockResolvedValue([dbRow({ ProjectId: null })]);
    await createTodoItem({ projectId: null, todoItem: "Global task" }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBeNull();
  });

  it("create forwards optional fields as null", async () => {
    execProc.mockResolvedValue([dbRow({ DueDate: null, Priority: null })]);
    await createTodoItem({ projectId: 3, todoItem: "Task" }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.DueDate).toBeNull();
    expect(params.Priority).toBeNull();
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getTodoItemById(4, 7)).resolves.toMatchObject({ TodoItem: "Review deliverables" });
  });

  it("list forwards ADR-0016 params with project scope", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 2 })]);
    const params = listParamsSchema.parse({ page: "1" });
    const rows = await listTodoItems(params, 7, 3);
    expect(rows[0].TotalCount).toBe(2);
    expect(execProc).toHaveBeenCalledWith("usp_TodoItem_List", {
      ActorUserId: 7,
      ProjectId: 3,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 1,
      PageSize: 25,
    });
  });

  it("list accepts null projectId for cross-project queries", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listTodoItems(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBeNull();
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TodoItemId: "bad" })]);
    await expect(listTodoItems(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update forwards RowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateTodoItem(
      { todoItemId: 4, rowVer: 20, projectId: 3, todoItem: "Review deliverables" },
      7,
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Update");
    expect(params.RowVer).toBe(20);
    expect(params.TodoItemId).toBe(4);
  });

  it("delete forwards TodoItemId and RowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteTodoItem(4, 20, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Delete");
    expect(params.TodoItemId).toBe(4);
    expect(params.RowVer).toBe(20);
  });

  it("getUpcomingAlertRows parses upcoming alert rows", async () => {
    execProc.mockResolvedValue([
      {
        TodoItemId: 4,
        TodoItem: "Review deliverables",
        DueDate: new Date("2025-06-01T00:00:00Z"),
        Priority: "High",
        Status: "Not Started",
        AlertType: "Overdue",
        TodoAlertId: null,
        AlertDay: null,
        AlertTime: null,
        SnoozeCount: null,
        MaxSnoozeCount: null,
        IsDismissed: null,
        RowVer: "20",
      },
    ]);
    const alerts = await getUpcomingAlertRows(7);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].AlertType).toBe("Overdue");
    expect(execProc).toHaveBeenCalledWith("usp_Todo_GetUpcomingAlerts", { ActorUserId: 7 });
  });
});
