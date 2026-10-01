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

let pushConfigured = true;
vi.mock("@/lib/push/config", () => ({
  getPushConfig: () => (pushConfigured ? { publicKey: "k", privateKey: "s", subject: "mailto:a@b.c", dispatchToken: "x".repeat(32) } : null),
}));

import { AppError } from "@/lib/errors";
import {
  buildTodoFromDailyActivityAction,
  createTodoAlertAction,
  createTodoItemAction,
  deleteTodoItemAction,
  dismissTodoAlertAction,
  registerPushSubscriptionAction,
  reorderTodoItemAction,
  snoozeTodoAlertAction,
  updateTodoAlertAction,
  updateTodoItemAction,
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
    SortKey: 4,
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

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh: "AAAA", auth: "BBBB" },
};

describe("todo-items actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    pushConfigured = true;
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
    fd.set("alertDay", "2025-11-01");
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
    fd.set("alertDay", "2025-11-01");
    const result = await createTodoAlertAction(fd);
    // Contributor has write access to todo-alerts per PLAN.md §9 / rbac.ts CONTRIBUTOR_WRITE_MODULES.
    expect(result.ok).toBe(true);
    const [proc] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoAlert_Create");
  });

  it("reorderTodoItemAction succeeds for a PM", async () => {
    execProc.mockResolvedValue([todoRow({ SortKey: 2 })]);
    const result = await reorderTodoItemAction({ todoItemId: 4, newSortKey: 2, rowVer: 20 });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_TodoItem_Reorder");
    expect(params.NewSortKey).toBe(2);
    expect(params.ActorUserId).toBe(7);
  });

  it("reorderTodoItemAction is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await reorderTodoItemAction({ todoItemId: 4, newSortKey: 2, rowVer: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("reorderTodoItemAction maps CONFLICT when RowVer stale", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "TodoItem was modified"));
    const result = await reorderTodoItemAction({ todoItemId: 4, newSortKey: 1, rowVer: 19 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("updateTodoAlertAction maps CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "TodoAlert was modified"));
    const fd = new FormData();
    fd.set("todoItemId", "4");
    fd.set("isDismissed", "false");
    fd.set("alertDay", "2025-11-01");
    fd.set("todoAlertId", "2");
    fd.set("rowVer", "4");
    const result = await updateTodoAlertAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("snoozeTodoAlertAction succeeds for a PM", async () => {
    execProc.mockResolvedValue([alertRow({ SnoozeCount: 1 })]);
    const result = await snoozeTodoAlertAction({ todoAlertId: 2, snoozeMinutes: 5, rowVer: 5 });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Todo_Snooze");
    expect(params.SnoozeMinutes).toBe(5);
    expect(params.ActorUserId).toBe(7);
  });

  it("snoozeTodoAlertAction is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await snoozeTodoAlertAction({ todoAlertId: 2, snoozeMinutes: 5, rowVer: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("dismissTodoAlertAction succeeds for a PM", async () => {
    execProc.mockResolvedValue([alertRow({ IsDismissed: true })]);
    const result = await dismissTodoAlertAction({ todoAlertId: 2, rowVer: 5 });
    expect(result.ok).toBe(true);
    const [proc] = execProc.mock.calls[0] as [string];
    expect(proc).toBe("usp_Todo_Dismiss");
  });

  it("buildTodoFromDailyActivityAction succeeds for a PM", async () => {
    execProc.mockResolvedValue([todoRow({ DailyActivityId: 5, ProjectOrActivity: "Daily Activity" })]);
    const result = await buildTodoFromDailyActivityAction({ dailyActivityId: 5 });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Todo_BuildFromDailyActivity");
    expect(params.DailyActivityId).toBe(5);
    expect(params.ActorUserId).toBe(7);
  });

  it("buildTodoFromDailyActivityAction is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await buildTodoFromDailyActivityAction({ dailyActivityId: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("buildTodoFromDailyActivityAction maps DUPLICATE to a VALIDATION error", async () => {
    execProc.mockRejectedValue(new AppError("DUPLICATE", "A to-do item already exists for this activity"));
    const result = await buildTodoFromDailyActivityAction({ dailyActivityId: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE");
  });
});

describe("registerPushSubscriptionAction", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    pushConfigured = true;
    execProc.mockReset();
  });

  it("persists the subscription when push is configured", async () => {
    execProc.mockResolvedValue([]);
    const result = await registerPushSubscriptionAction(validSubscription);
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AlertSubscription_Upsert");
    expect(params.ActorUserId).toBe(7);
    expect(params.Endpoint).toBe(validSubscription.endpoint);
  });

  it("returns ok: true and skips the proc when push is not configured", async () => {
    pushConfigured = false;
    const result = await registerPushSubscriptionAction(validSubscription);
    expect(result.ok).toBe(true);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("returns VALIDATION for a subscription with an untrusted endpoint", async () => {
    const result = await registerPushSubscriptionAction({
      ...validSubscription,
      endpoint: "https://push.example.com/sub/abc123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await registerPushSubscriptionAction(validSubscription);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("is allowed for a Contributor (todo-alerts in CONTRIBUTOR_WRITE_MODULES)", async () => {
    execProc.mockResolvedValue([]);
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const result = await registerPushSubscriptionAction(validSubscription);
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("maps a DB error to INTERNAL", async () => {
    execProc.mockRejectedValue(new Error("connection reset"));
    const result = await registerPushSubscriptionAction(validSubscription);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL");
  });
});

describe("registerPushSubscriptionAction — endpoint ownership transfer", () => {
  /**
   * When user A and user B use the same browser profile, PushManager returns
   * the same endpoint for both.  The action must pass each caller's ActorUserId
   * to the proc so the proc can atomically retire the previous owner's row and
   * insert a fresh one for the new owner.
   *
   * This suite verifies the TypeScript contract: each call reaches the upsert
   * proc with the session's own UserId, regardless of who registered the same
   * endpoint earlier.
   */
  beforeEach(() => {
    pushConfigured = true;
    execProc.mockReset();
    execProc.mockResolvedValue([]);
  });

  it("passes user A's ActorUserId when user A registers the endpoint first", async () => {
    session = { userId: 1, username: "userA", role: "ProjectManager" };
    await registerPushSubscriptionAction(validSubscription);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AlertSubscription_Upsert");
    expect(params.ActorUserId).toBe(1);
    expect(params.Endpoint).toBe(validSubscription.endpoint);
  });

  it("passes user B's ActorUserId when the same endpoint is re-registered by user B", async () => {
    // Simulate user A having registered first.
    session = { userId: 1, username: "userA", role: "ProjectManager" };
    await registerPushSubscriptionAction(validSubscription);

    // User B signs in and registers the same endpoint — action must forward
    // user B's UserId so the proc can transfer ownership atomically.
    session = { userId: 2, username: "userB", role: "ProjectManager" };
    await registerPushSubscriptionAction(validSubscription);

    expect(execProc).toHaveBeenCalledTimes(2);
    const [, paramsA] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    const [, paramsB] = execProc.mock.calls[1] as [string, Record<string, unknown>];
    expect(paramsA.ActorUserId).toBe(1);
    expect(paramsB.ActorUserId).toBe(2);
    // Both calls target the same endpoint.
    expect(paramsA.Endpoint).toBe(paramsB.Endpoint);
  });

  it("re-registration by the same user is idempotent (same ActorUserId both calls)", async () => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    await registerPushSubscriptionAction(validSubscription);
    await registerPushSubscriptionAction(validSubscription);
    expect(execProc).toHaveBeenCalledTimes(2);
    for (const call of execProc.mock.calls as [string, Record<string, unknown>][]) {
      expect(call[1].ActorUserId).toBe(7);
    }
  });
});
