import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjectOptions,
  listProjects,
  PROJECT_LIST_PAGE_MAX,
  searchProjects,
  updateProject,
} from "../repository/projects";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ProjectId: 2,
    ProjectName: "Upgrade Inventory Management",
    ProjectManager: "Saeol",
    BusinessAnalyst: null,
    ProjectDocs: null,
    ProjectSponsor: "Borton",
    DateOfProject: new Date("2024-12-14"),
    ProblemStatement: "Inventory discrepancies",
    CurrentState: null,
    FutureState: null,
    UserImpact: "medium",
    Mandate: null,
    ProjectStatusCom: "Completed",
    ExistBusMod: null,
    A1: true,
    DA: false,
    DAS: false,
    DO: false,
    FinancingSource: "Unknown",
    FinancingCost: 500,
    RecurrentCost: 0,
    PurchaseEquipment: false,
    EquipmentNotes: null,
    StartDate: new Date("2024-12-13"),
    EndDate: new Date("2024-12-28"),
    SimilarProject: false,
    ProjectPriority: null,
    EstimatedCompletionDate: null,
    ProjectStatus: "Completed",
    ProjectPhase: null,
    RiskLevel: null,
    PoRequisitionStatus: null,
    RequisitionStatus: null,
    DoNothing: null,
    AlternativeSolutions: null,
    ExpectedBenefits: null,
    SuccessMetrics: null,
    EstimatedRoi: null,
    ProjectScope: null,
    KeyDependencies: null,
    // FOR JSON PATH arrives as a string, like the CAST rowversion below
    ObjectiveAlignment: '[{"label":"Growth"},{"label":"Sustainability"}]',
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "2001", // driver returns CAST(RowVer AS BIGINT) as a string
    ...overrides,
  };
}

describe("projects repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create forwards normalised params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createProject({ projectName: "Upgrade Inventory Management" }, 7);
    expect(row.ProjectId).toBe(2);
    expect(row.RowVer).toBe(2001); // coerced to number by the row schema
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Project_Create");
    expect(params.ProjectName).toBe("Upgrade Inventory Management");
    expect(params.ProjectManager).toBeNull();
    expect(params.A1).toBe(false);
    expect(params.ActorUserId).toBe(7);
    expect(row.ObjectiveAlignment).toEqual(["Growth", "Sustainability"]);
  });

  it("create rejects an empty project name before touching the database", async () => {
    await expect(createProject({ projectName: "  " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await getProjectById(2, 7);
    expect(row.ProjectName).toBe("Upgrade Inventory Management");
    expect(execProc).toHaveBeenCalledWith("usp_Project_GetById", {
      ProjectId: 2,
      ActorUserId: 7,
    });
  });

  it("getById carries the plan's sticky note, and a row without one still parses (ADR-0052)", async () => {
    execProc.mockResolvedValue([dbRow({ PlanNote: "Freeze scope in March" })]);
    expect((await getProjectById(2, 7)).PlanNote).toBe("Freeze scope in March");
    execProc.mockResolvedValue([dbRow()]);
    expect((await getProjectById(2, 7)).PlanNote).toBeUndefined();
  });

  it("list forwards the ADR-0016 params 1:1 and parses TotalCount", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 18, ActorAccess: "Manager" })]);
    const params = listParamsSchema.parse({ q: "Upgrade", sort: "ProjectName", dir: "desc" });
    const rows = await listProjects(params, 7);
    expect(rows[0].TotalCount).toBe(18);
    expect(execProc).toHaveBeenCalledWith("usp_Project_List", {
      ActorUserId: 7,
      ProjectId: null,
      Status: null,
      Priority: null,
      Search: "Upgrade",
      SortBy: "ProjectName",
      SortDir: "desc",
      Page: 1,
      PageSize: 25,
    });
  });

  it("project options read every page, so a project past the first 100 names is still offered", async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) =>
        dbRow({
          ProjectId: from + i,
          ProjectName: `Project ${from + i}`,
          TotalCount: 215,
          ActorAccess: "Viewer",
        }),
      );
    execProc
      .mockResolvedValueOnce(page(1, PROJECT_LIST_PAGE_MAX))
      .mockResolvedValueOnce(page(101, PROJECT_LIST_PAGE_MAX))
      .mockResolvedValueOnce(page(201, 15));
    const options = await listProjectOptions(41);
    expect(options).toHaveLength(215);
    expect(options[214]).toEqual({ id: 215, name: "Project 215", access: "Viewer" });
    expect(execProc.mock.calls.map(([, p]) => [p.Page, p.PageSize])).toEqual([
      [1, PROJECT_LIST_PAGE_MAX],
      [2, PROJECT_LIST_PAGE_MAX],
      [3, PROJECT_LIST_PAGE_MAX],
    ]);
  });

  it("list rejects rows that break the contract", async () => {
    execProc.mockResolvedValue([
      dbRow({ TotalCount: 18, ActorAccess: "Manager", ProjectName: null }),
    ]);
    const params = listParamsSchema.parse({});
    await expect(listProjects(params, 7)).rejects.toThrow();
  });

  it("update sends id + rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow({ UpdatedAtUtc: new Date() })]);
    await updateProject({ projectId: 2, rowVer: 2001, projectName: "Renamed" }, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Project_Update");
    expect(params.ProjectId).toBe(2);
    expect(params.RowVer).toBe(2001);
    expect(params.ProjectName).toBe("Renamed");
  });

  it("sends the objectives as a JSON array, and the Set flag only when they were sent", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateProject(
      { projectId: 2, rowVer: 2001, projectName: "X", objectiveAlignment: ["Growth", "Cost"] },
      7,
    );
    const [, sent] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(sent.ObjectiveAlignment).toBe('["Growth","Cost"]');
    expect(sent.ObjectiveAlignmentSet).toBe(1);

    execProc.mockReset();
    execProc.mockResolvedValue([dbRow()]);
    await updateProject({ projectId: 2, rowVer: 2001, projectName: "X" }, 7);
    const [, untouched] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    // A write that never showed the field: the proc leaves the project's own objectives alone.
    expect(untouched.ObjectiveAlignment).toBeNull();
    expect(untouched.ObjectiveAlignmentSet).toBe(0);
  });

  it("sends the empty set as an empty array, which clears the objectives", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateProject(
      { projectId: 2, rowVer: 2001, projectName: "X", objectiveAlignment: [] },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ObjectiveAlignment).toBe("[]");
    expect(params.ObjectiveAlignmentSet).toBe(1);
  });

  it("list leaves the objectives unread, which is not the same as none", async () => {
    execProc.mockResolvedValue([
      { ...dbRow({ ObjectiveAlignment: undefined }), TotalCount: 1, ActorAccess: "Manager" },
    ]);
    const rows = await listProjects(
      { q: undefined, sort: "ProjectName", dir: "asc", view: undefined, page: 1 },
      7,
    );
    expect(rows[0].ObjectiveAlignment).toBeUndefined();
  });

  it("delete forwards id, rowVer and actor", async () => {
    execProc.mockResolvedValue([]);
    await deleteProject(2, 2001, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Project_Delete", {
      ProjectId: 2,
      RowVer: 2001,
      ActorUserId: 7,
    });
  });

  it("search parses type-ahead rows", async () => {
    execProc.mockResolvedValue([{ ProjectId: 2, ProjectName: "Upgrade", RowVer: "9" }]);
    const rows = await searchProjects("Up", 7);
    expect(rows).toEqual([{ ProjectId: 2, ProjectName: "Upgrade", RowVer: 9 }]);
    expect(execProc).toHaveBeenCalledWith("usp_Project_Search", {
      Prefix: "Up",
      ActorUserId: 7,
    });
  });
});
