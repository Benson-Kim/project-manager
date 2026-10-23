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
  createRequirementAction,
  deleteRequirementAction,
  updateRequirementAction,
} from "../actions";

/** A full app.Requirement row as the procs answer (usp_Requirement_GetById shape). */
function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    RequirementId: 3,
    ProjectId: 2,
    RequirementType: "FR",
    Number: 1,
    Requirement: "The system sends a receipt",
    IsMet: false,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "99",
    ValidatesJson: null,
    ValidatedByJson: null,
    DeliverablesJson: null,
    ...overrides,
  };
}

describe("requirements actions (ADR-0037)", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create forwards the fields and leaves the link lists empty when their flags are off", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "FR");
    fd.set("requirement", "The system sends a receipt");
    fd.set("isMet", "on");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.RequirementId).toBe(3);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Requirement_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.RequirementType).toBe("FR");
    expect(params.Requirement).toBe("The system sends a receipt");
    // isMet is honoured for a solution type.
    expect(params.IsMet).toBe(true);
    // No "set" flag was sent, so the proc leaves links and allocations alone.
    expect(params.ValidatesIds).toBeNull();
    expect(params.KeyDeliverableIds).toBeNull();
    expect(params.ActorUserId).toBe(7);
  });

  it("create forces a need unticked and passes its chosen links", async () => {
    execProc.mockResolvedValue([dbRow({ RequirementType: "BR", IsMet: false })]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "BR");
    fd.set("requirement", "Reduce processing time");
    fd.set("isMet", "on");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    // A business requirement cannot be met, whatever the form sent.
    expect(params.IsMet).toBe(false);
  });

  it("create sends the need links as a JSON array when the set flag is on", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "FR");
    fd.set("requirement", "Covers BR-1 and BR-2");
    fd.set("validatesSet", "on");
    fd.append("validatesIds[]", "11");
    fd.append("validatesIds[]", "12");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(true);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ValidatesIds).toBe(JSON.stringify([11, 12]));
  });

  it("create returns VALIDATION with fieldErrors for empty wording", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "FR");
    fd.set("requirement", "  ");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.requirement).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create rejects an unknown type without reaching the proc", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "XX");
    fd.set("requirement", "Something");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("requirementType", "FR");
    fd.set("requirement", "Test");
    const result = await createRequirementAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update drops fields the client must not set (no mass assignment)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("requirementId", "3");
    fd.set("rowVer", "99");
    fd.set("requirementType", "FR");
    fd.set("requirement", "The system sends a receipt");
    // These are not in the schema and must never reach the proc.
    fd.set("projectId", "999");
    fd.set("number", "42");
    fd.set("isDeleted", "1");
    const result = await updateRequirementAction(fd);
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Requirement_Update");
    expect(params).not.toHaveProperty("ProjectId");
    expect(params).not.toHaveProperty("Number");
    expect(params).not.toHaveProperty("IsDeleted");
    // A plain cell edit sent no "set" flags, so both lists stay untouched.
    expect(params.ValidatesSet).toBe(0);
    expect(params.DeliverablesSet).toBe(0);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "Requirement was modified by someone else"),
    );
    const fd = new FormData();
    fd.set("requirementId", "3");
    fd.set("rowVer", "98");
    fd.set("requirementType", "FR");
    fd.set("requirement", "The system sends a receipt");
    const result = await updateRequirementAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete forwards the ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteRequirementAction({ requirementId: 3, rowVer: 99 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Requirement_Delete", {
      RequirementId: 3,
      RowVer: 99,
      ActorUserId: 7,
    });
  });
});
