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
import { createObjectiveAction, updateObjectiveAction, deleteObjectiveAction } from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ObjectiveId: 3,
    ProjectId: 2,
    QMeasurable: "Yes",
    QSuccess: "Yes",
    QAlignmentStrategy: "Aligned",
    ObjectiveText: "Improve system reliability",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "99",
    ...overrides,
  };
}

describe("objectives actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("objectiveText", "Improve system reliability");
    fd.set("qMeasurable", "Yes");
    const result = await createObjectiveAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ObjectiveId).toBe(3);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Objective_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ObjectiveText).toBe("Improve system reliability");
    expect(params.QMeasurable).toBe("Yes");
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for empty objectiveText", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("objectiveText", "  ");
    const result = await createObjectiveAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.objectiveText).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("objectiveText", "Test");
    const result = await createObjectiveAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Objective was modified by someone else"));
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("objectiveText", "Improve system reliability");
    fd.set("objectiveId", "3");
    fd.set("rowVer", "98");
    const result = await updateObjectiveAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteObjectiveAction({ objectiveId: 3, rowVer: 99 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Objective_Delete", {
      ObjectiveId: 3,
      RowVer: 99,
      ActorUserId: 7,
    });
  });
});
