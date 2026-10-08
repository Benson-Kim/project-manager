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
  createStakeholderAction,
  updateStakeholderAction,
  deleteStakeholderAction,
} from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    StakeholderId: 1,
    ProjectId: 2,
    FirstName: "Gary",
    LastName: null,
    DepartmentOrganization: null,
    ProjectRole: null,
    RoleDescription: null,
    PhoneNumber: null,
    PhoneExt: null,
    Mobile: null,
    EmailAddress: null,
    PhysicalLocation: null,
    OrgTitle: null,
    CommunicationPreference: null,
    EngagementLevel: null,
    AdditionalNotes: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "10",
    ...overrides,
  };
}

describe("stakeholders actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("firstName", "Gary");
    fd.set("engagementLevel", "Medium");
    const result = await createStakeholderAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.StakeholderId).toBe(1);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBe(2);
    expect(params.EngagementLevel).toBe("Medium");
    expect(params.ActorUserId).toBe(7);
    expect(params).not.toHaveProperty("ActorRole");
    // project-scoped route; sheet calls router.refresh() — no static revalidatePath
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("create returns VALIDATION with fieldErrors for an empty first name", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("firstName", "  ");
    const result = await createStakeholderAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.firstName).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("firstName", "Gary");
    const result = await createStakeholderAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "Stakeholder was modified by someone else"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("firstName", "Gary");
    fd.set("stakeholderId", "1");
    fd.set("rowVer", "9");
    const result = await updateStakeholderAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteStakeholderAction({ stakeholderId: 1, rowVer: 10 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Stakeholder_Delete", {
      StakeholderId: 1,
      RowVer: 10,
      ActorUserId: 7,
    });
    // project-scoped route; sheet calls router.refresh() — no static revalidatePath
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
