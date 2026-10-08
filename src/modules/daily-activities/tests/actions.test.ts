import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
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
  createDailyActivityAction,
  updateDailyActivityAction,
  deleteDailyActivityAction,
} from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    DailyActivityId: 10,
    ProjectId: 3,
    ActivityStatusId: 1,
    ActivityStatus: "Not Started",
    Requester: "Alice",
    Task: "Write tests",
    MyActivity: null,
    ActivityDate: null,
    Comments: null,
    RequestDate: new Date("2025-06-01T00:00:00Z"),
    Status: null,
    CompleteDate: null,
    ContactMethod: "Email",
    TimeSpent: 2,
    AssignedTo: "Bob",
    TaskType: "Technical",
    Progress: 50,
    CreatedAtUtc: new Date("2025-06-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "88",
    ...overrides,
  };
}

describe("daily-activities actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("task", "Write tests");
    const result = await createDailyActivityAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.DailyActivityId).toBe(10);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_DailyActivity_Create");
    expect(params.ProjectId).toBe(3);
    expect(params.ActorUserId).toBe(7);
  });

  it("create forwards optional numeric fields", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("timeSpent", "3");
    fd.set("progress", "80");
    await createDailyActivityAction(fd);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.TimeSpent).toBe(3);
    expect(params.Progress).toBe(80);
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "3");
    const result = await createDailyActivityAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("create is allowed for a Contributor (daily-activities is in CONTRIBUTOR_WRITE_MODULES per PLAN.md)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    session = { userId: 8, username: "contrib", role: "User" };
    const fd = new FormData();
    fd.set("projectId", "3");
    const result = await createDailyActivityAction(fd);
    // Contributor has write access to daily-activities — NOT forbidden.
    expect(result.ok).toBe(true);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "DailyActivity was modified"));
    const fd = new FormData();
    fd.set("projectId", "3");
    fd.set("dailyActivityId", "10");
    fd.set("rowVer", "87");
    const result = await updateDailyActivityAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds and does not call revalidatePath (dynamic route)", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteDailyActivityAction({ dailyActivityId: 10, rowVer: 88 });
    expect(result.ok).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(execProc).toHaveBeenCalledWith("usp_DailyActivity_Delete", {
      DailyActivityId: 10,
      RowVer: 88,
      ActorUserId: 7,
    });
  });
});
