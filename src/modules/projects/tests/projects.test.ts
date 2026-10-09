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
  listProjects,
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
    PurchaseOrder: true,
    Requisition: true,
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
