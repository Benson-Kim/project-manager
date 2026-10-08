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
import { createProjectAction, setProjectAssigneesAction, updateProjectAction } from ".";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ProjectId: 2,
    ProjectName: "Network refresh",
    ProjectManager: null,
    BusinessAnalyst: null,
    ProjectDocs: null,
    ProjectSponsor: null,
    DateOfProject: null,
    ProblemStatement: null,
    CurrentState: null,
    FutureState: null,
    UserImpact: null,
    Mandate: null,
    ProjectStatusCom: null,
    ExistBusMod: null,
    A1: false,
    DA: false,
    DAS: false,
    PurchaseOrder: false,
    Requisition: false,
    DO: false,
    FinancingSource: null,
    FinancingCost: null,
    RecurrentCost: null,
    PurchaseEquipment: false,
    EquipmentNotes: null,
    StartDate: null,
    EndDate: null,
    SimilarProject: false,
    ProjectPriority: null,
    EstimatedCompletionDate: null,
    ProjectStatus: null,
    ProjectPhase: null,
    RiskLevel: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "10",
    ...overrides,
  };
}

describe("projects actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData and revalidates /projects", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectName", "Network refresh");
    fd.set("do", "on");
    const result = await createProjectAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ProjectId).toBe(2);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.DO).toBe(true);
    expect(params.ActorUserId).toBe(7);
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("create returns VALIDATION with fieldErrors for an empty name", async () => {
    const fd = new FormData();
    fd.set("projectName", "  ");
    const result = await createProjectAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.projectName).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is open to every User; the proc makes the creator the project's Manager", async () => {
    session = { userId: 9, username: "member", role: "User" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectName", "Network refresh");
    const result = await createProjectAction(fd);
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Project_Create");
    expect(params.ActorUserId).toBe(9);
  });

  it("update surfaces the proc's FORBIDDEN_ROW for a non-Manager", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("projectName", "Network refresh");
    fd.set("rowVer", "10");
    const result = await updateProjectAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Project was modified by someone else"));
    const fd = new FormData();
    fd.set("projectName", "Network refresh");
    fd.set("projectId", "2");
    fd.set("rowVer", "9");
    const result = await updateProjectAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("setAssignees passes the whole team, with access levels, through in one call", async () => {
    execProc.mockResolvedValue([]);
    const result = await setProjectAssigneesAction({
      projectId: 2,
      assignees: [
        { role: "ProjectManager", personName: "Dana Roy", userId: 7, accessLevel: "Manager" },
        { role: "Sponsor", personName: "Mei Chen", accessLevel: "Viewer" },
      ],
    });
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ProjectAssignee_Set");
    expect(JSON.parse(params.AssigneesJson as string)).toEqual([
      { role: "ProjectManager", personName: "Dana Roy", userId: 7, accessLevel: "Manager" },
      { role: "Sponsor", personName: "Mei Chen", accessLevel: "Viewer" },
    ]);
  });

  it("setAssignees surfaces the proc's VALIDATION when a manager would remove their own access", async () => {
    execProc.mockRejectedValue(
      new AppError("VALIDATION", "You cannot remove your own manager access"),
    );
    const result = await setProjectAssigneesAction({ projectId: 2, assignees: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});
