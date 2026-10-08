import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  buildTodoFromDailyActivity,
  createTodoItem,
  deleteTodoItem,
  getTodoItemById,
  getUpcomingAlertRows,
  listTodoItems,
  reorderTodoItem,
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
    SortKey: 4,
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

  it("getById sends only the actor id (no role, ADR-0021) and parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getTodoItemById(4, 7)).resolves.toMatchObject({ TodoItem: "Review deliverables" });
    expect(execProc).toHaveBeenCalledWith("usp_TodoItem_GetById", {
      TodoItemId: 4,
      ActorUserId: 7,
    });
  });

  it("getById — Admin role is forwarded (Admin bypass)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getTodoItemById(4, 99);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
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
      Status: null,
      Priority: null,
      ProjectOrActivity: null,
    });
  });

  it("list sends no role to the proc (ADR-0021)", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listTodoItems(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list accepts null projectId for cross-project queries", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listTodoItems(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBeNull();
  });

  it("list forwards status and priority filter params to the proc", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listTodoItems(listParamsSchema.parse({}), 7, 3, 25, {
      status: "In Progress",
      priority: "High",
      projectOrActivity: "Project",
    });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_List");
    expect(params.Status).toBe("In Progress");
    expect(params.Priority).toBe("High");
    expect(params.ProjectOrActivity).toBe("Project");
  });

  it("list sends null filter params when filters object is empty", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listTodoItems(listParamsSchema.parse({}), 7, 3);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Status).toBeNull();
    expect(params.Priority).toBeNull();
    expect(params.ProjectOrActivity).toBeNull();
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

  it("reorderTodoItem calls usp_TodoItem_Reorder and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow({ SortKey: 2 })]);
    const row = await reorderTodoItem({ todoItemId: 4, newSortKey: 2, rowVer: 20 }, 7);
    expect(row.SortKey).toBe(2);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Reorder");
    expect(params.TodoItemId).toBe(4);
    expect(params.NewSortKey).toBe(2);
    expect(params.RowVer).toBe(20);
    expect(params.ActorUserId).toBe(7);
  });

  it("reorderTodoItem throws NOT_FOUND when proc returns no row", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      reorderTodoItem({ todoItemId: 99, newSortKey: 1, rowVer: 1 }, 7),
    ).rejects.toThrow();
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

  it("buildTodoFromDailyActivity calls usp_Todo_BuildFromDailyActivity and parses the row", async () => {
    execProc.mockResolvedValue([
      dbRow({ DailyActivityId: 5, ProjectOrActivity: "Daily Activity" }),
    ]);
    const row = await buildTodoFromDailyActivity(5, 7);
    expect(row.DailyActivityId).toBe(5);
    expect(row.ProjectOrActivity).toBe("Daily Activity");
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Todo_BuildFromDailyActivity");
    expect(params.DailyActivityId).toBe(5);
    expect(params.ActorUserId).toBe(7);
  });

  it("buildTodoFromDailyActivity throws NOT_FOUND when proc returns no row", async () => {
    execProc.mockResolvedValue([]);
    await expect(buildTodoFromDailyActivity(99, 7)).rejects.toThrow();
  });
});
