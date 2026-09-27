import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "ProjectManager" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { AppError } from "@/lib/errors";
import {
  createTodoItemAction,
  updateTodoItemAction,
  deleteTodoItemAction,
  createTodoAlertAction,
  updateTodoAlertAction,
} from ".";

function todoRow(overrides: Record<string, unknown> = {}) {
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

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    TodoAlertId: 2,
    TodoItemId: 4,
    AlertDay: null,
    AlertTime: "09:00:00",
    RepeatUnit: "Day",
    RepeatInterval: 1,
    CurrentRepeatInterval: null,
    SnoozeCount: 0,
    LastSnoozeTime: null,
    MaxSnoozeCount: 3,
    SnoozeOptions: null,
    IsDismissed: false,
    CreatedAtUtc: new Date("2025-06-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "5",
    ...overrides,
  };
}

describe("todo-items actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([todoRow()]);
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("todoItem", "Review deliverables");
    fd.set("priority", "High");
    const result = await createTodoItemAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.TodoItemId).toBe(4);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Create");
    expect(params.ProjectId).toBe(3);
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION for empty todoItem", async () => {
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("todoItem", "  ");
    const result = await createTodoItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.todoItem).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Viewer (RBAC)", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("todoItem", "Task");
    const result = await createTodoItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Contributor (Admin + PM only for todo-items)", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("todoItem", "Task");
    const result = await createTodoItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("update maps rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "TodoItem was modified"));
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("todoItem", "Review deliverables");
    fd.set("todoItemId", "4");
    fd.set("rowVer", "19");
    const result = await updateTodoItemAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds and does not call revalidatePath", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteTodoItemAction({ todoItemId: 4, rowVer: 20 });
    expect(result.ok).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(execProc).toHaveBeenCalledWith("usp_TodoItem_Delete", {
      TodoItemId: 4,
      RowVer: 20,
      ActorUserId: 7,
    });
  });

  it("createTodoAlertAction succeeds", async () => {
    execProc.mockResolvedValue([alertRow()]);
    const fd = new FormData();
    fd.set("todoItemId", "4");
    fd.set("isDismissed", "false");
    fd.set("alertTime", "09:00");
    const result = await createTodoAlertAction(fd);
    expect(result.ok).toBe(true);
    const [proc] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Create");
  });

  it("createTodoAlertAction is allowed for a Contributor (todo-alerts in CONTRIBUTOR_WRITE_MODULES)", async () => {
    execProc.mockResolvedValue([alertRow()]);
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const fd = new FormData();
    fd.set("todoItemId", "4");
    fd.set("isDismissed", "false");
    const result = await createTodoAlertAction(fd);
    // Contributor has write access to todo-alerts per PLAN.md §9 / rbac.ts CONTRIBUTOR_WRITE_MODULES.
    expect(result.ok).toBe(true);
    const [proc] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Create");
  });

  it("updateTodoAlertAction maps CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "TodoAlert was modified"));
    const fd = new FormData();
    fd.set("todoItemId", "4");
    fd.set("isDismissed", "false");
    fd.set("todoAlertId", "2");
    fd.set("rowVer", "4");
    const result = await updateTodoAlertAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});
