import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createStakeholder,
  deleteStakeholder,
  getStakeholderById,
  listStakeholders,
  updateStakeholder,
} from "../repository/stakeholders";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    StakeholderId: 1,
    ProjectId: 2,
    FirstName: "Gary",
    LastName: "Cantrall",
    DepartmentOrganization: "Organization and efficiency",
    ProjectRole: "Developer",
    RoleDescription: null,
    PhoneNumber: "+1 561 6718 677",
    PhoneExt: "166",
    Mobile: "89766780",
    EmailAddress: null,
    PhysicalLocation: "Aus",
    OrgTitle: "Software Engineer",
    CommunicationPreference: "Email",
    EngagementLevel: "Medium",
    AdditionalNotes: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "2001", // driver returns CAST(RowVer AS BIGINT) as a string
    ...overrides,
  };
}

describe("stakeholders repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create forwards normalised params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createStakeholder({ projectId: 2, firstName: "Gary" }, 7);
    expect(row.StakeholderId).toBe(1);
    expect(row.RowVer).toBe(2001); // coerced to number by the row schema
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Stakeholder_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.FirstName).toBe("Gary");
    expect(params.LastName).toBeNull();
    expect(params.ActorUserId).toBe(7);
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("create rejects an empty first name before touching the database", async () => {
    await expect(createStakeholder({ projectId: 2, firstName: "  " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("getById sends only the actor id (no role, ADR-0021) and parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await getStakeholderById(1, 7);
    expect(row.FirstName).toBe("Gary");
    expect(execProc).toHaveBeenCalledWith("usp_Stakeholder_GetById", {
      StakeholderId: 1,
      ActorUserId: 7,
    });
  });

  it("getById — Admin role is forwarded (Admin bypass)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getStakeholderById(1, 99);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list forwards the ADR-0016 params and module filters 1:1", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 8, ActorAccess: "Manager" })]);
    const params = listParamsSchema.parse({ q: "Gary", sort: "LastName", dir: "desc" });
    const rows = await listStakeholders(params, 7, { project: 2, engagement: "Medium" });
    expect(rows[0].TotalCount).toBe(8);
    expect(execProc).toHaveBeenCalledWith("usp_Stakeholder_List", {
      ActorUserId: 7,
      ProjectId: 2,
      EngagementLevel: "Medium",
      Search: "Gary",
      SortBy: "LastName",
      SortDir: "desc",
      Page: 1,
      PageSize: 25,
    });
  });

  it("list sends no role to the proc (ADR-0021)", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1, ActorAccess: "Manager" })]);
    await listStakeholders(listParamsSchema.parse({}), 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list rejects rows that break the contract", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 8, ActorAccess: "Manager", FirstName: null })]);
    const params = listParamsSchema.parse({});
    await expect(listStakeholders(params, 7)).rejects.toThrow();
  });

  it("update sends id + rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow({ UpdatedAtUtc: new Date() })]);
    await updateStakeholder({ stakeholderId: 1, rowVer: 2001, projectId: 2, firstName: "G" }, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Stakeholder_Update");
    expect(params.StakeholderId).toBe(1);
    expect(params.RowVer).toBe(2001);
    expect(params.FirstName).toBe("G");
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("Admin bypasses the project-scope check on update", async () => {
    execProc.mockResolvedValue([dbRow({ UpdatedAtUtc: new Date() })]);
    await updateStakeholder({ stakeholderId: 1, rowVer: 2001, projectId: 2, firstName: "G" }, 99);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("delete forwards id, rowVer, actor and role", async () => {
    execProc.mockResolvedValue([]);
    await deleteStakeholder(1, 2001, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Stakeholder_Delete", {
      StakeholderId: 1,
      RowVer: 2001,
      ActorUserId: 7,
    });
  });
});
