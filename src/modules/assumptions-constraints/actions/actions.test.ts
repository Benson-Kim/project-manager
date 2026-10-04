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
  createAssumptionConstraintAction,
  deleteAssumptionConstraintAction,
  updateAssumptionConstraintAction,
} from ".";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    AssumptionConstraintId: 1,
    ProjectId: 2,
    Type: "Assumption",
    Description: "An assumption about scope",
    IsValidated: false,
    Impact: null,
    MitigationPlan: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("assumptions-constraints actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption about scope");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.AssumptionConstraintId).toBe(1);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Description).toBe("An assumption about scope");
    expect(params.ActorUserId).toBe(7);
    expect(params.ActorRole).toBe("ProjectManager");
  });

  it("create with type=Constraint forwards to proc", async () => {
    execProc.mockResolvedValue([dbRow({ Type: "Constraint" })]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "A hard constraint");
    fd.set("type", "Constraint");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Type).toBe("Constraint");
  });

  it("create with impact=Medium forwards to proc", async () => {
    execProc.mockResolvedValue([dbRow({ Impact: "Medium" })]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption");
    fd.set("impact", "Medium");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Impact).toBe("Medium");
  });

  it("create with impact=Low forwards to proc", async () => {
    execProc.mockResolvedValue([dbRow({ Impact: "Low" })]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption");
    fd.set("impact", "Low");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Impact).toBe("Low");
  });

  it("create with isValidated=on forwards IsValidated=true", async () => {
    execProc.mockResolvedValue([dbRow({ IsValidated: true })]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "Verified assumption");
    fd.set("isValidated", "on");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.IsValidated).toBe(true);
  });

  it("create returns VALIDATION for an empty description", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "  ");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.description).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create returns VALIDATION for an invalid type", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption");
    fd.set("type", "Risk");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption about scope");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create succeeds for a Contributor (assumptions-constraints is in CONTRIBUTOR_WRITE_MODULES)", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption about scope");
    const result = await createAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.AssumptionConstraintId).toBe(1);
  });

  // ── update ───────────────────────────────────────────────────────────────

  it("update succeeds for a Contributor", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "Updated description");
    fd.set("assumptionConstraintId", "1");
    fd.set("rowVer", "42");
    const result = await updateAssumptionConstraintAction(fd);
    expect(result.ok).toBe(true);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "AssumptionConstraint was modified by someone else"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption about scope");
    fd.set("assumptionConstraintId", "1");
    fd.set("rowVer", "41");
    const result = await updateAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("update maps NOT_FOUND to an error (record deleted mid-edit)", async () => {
    execProc.mockRejectedValue(
      new AppError("NOT_FOUND", "AssumptionConstraint not found"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption");
    fd.set("assumptionConstraintId", "1");
    fd.set("rowVer", "42");
    const result = await updateAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("update is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("description", "An assumption about scope");
    fd.set("assumptionConstraintId", "1");
    fd.set("rowVer", "42");
    const result = await updateAssumptionConstraintAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  // ── delete ───────────────────────────────────────────────────────────────

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteAssumptionConstraintAction({
      assumptionConstraintId: 1,
      rowVer: 42,
    });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_AssumptionConstraint_Delete", {
      AssumptionConstraintId: 1,
      RowVer: 42,
      ActorUserId: 7,
      ActorRole: "ProjectManager",
    });
  });

  it("delete maps rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "AssumptionConstraint was modified by someone else"),
    );
    const result = await deleteAssumptionConstraintAction({
      assumptionConstraintId: 1,
      rowVer: 41,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete maps NOT_FOUND when record is already deleted", async () => {
    execProc.mockRejectedValue(
      new AppError("NOT_FOUND", "AssumptionConstraint not found"),
    );
    const result = await deleteAssumptionConstraintAction({
      assumptionConstraintId: 1,
      rowVer: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("delete is FORBIDDEN for a Contributor", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const result = await deleteAssumptionConstraintAction({
      assumptionConstraintId: 1,
      rowVer: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("delete is FORBIDDEN for a Viewer", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const result = await deleteAssumptionConstraintAction({
      assumptionConstraintId: 1,
      rowVer: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });
});
