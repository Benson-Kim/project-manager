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
  createKeyDeliverableAction,
  updateKeyDeliverableAction,
  deleteKeyDeliverableAction,
} from ".";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeyDeliverableId: 7,
    ProjectId: 24,
    KeyRequirement: "Fast reports generation",
    Deadline: null,
    AssignedToStakeholderId: null,
    Priority: null,
    Status: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "10",
    ...overrides,
  };
}

describe("key-deliverables actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "Fast reports generation");
    fd.set("deadline", "2026-12-26");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.KeyDeliverableId).toBe(7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBe(24);
    expect(params.Deadline).toEqual(new Date("2026-12-26"));
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for an empty requirement", async () => {
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "  ");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.keyRequirement).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "R");
    const result = await createKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update maps a proc CONFLICT to the CONFLICT result", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "modified"));
    const fd = new FormData();
    fd.set("projectId", "24");
    fd.set("keyRequirement", "R");
    fd.set("keyDeliverableId", "7");
    fd.set("rowVer", "9");
    const result = await updateKeyDeliverableAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds for Admin and forwards id + rowVer", async () => {
    session = { userId: 1, username: "admin", role: "Admin" };
    execProc.mockResolvedValue([]);
    const result = await deleteKeyDeliverableAction({ keyDeliverableId: 7, rowVer: 10 });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_KeyDeliverable_Delete");
    expect(params.KeyDeliverableId).toBe(7);
    expect(params.RowVer).toBe(10);
  });
});
