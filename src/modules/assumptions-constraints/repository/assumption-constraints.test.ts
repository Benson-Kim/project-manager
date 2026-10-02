import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createAssumptionConstraint,
  deleteAssumptionConstraint,
  getAssumptionConstraintById,
  listAssumptionConstraints,
  updateAssumptionConstraint,
} from "./assumption-constraints";

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

describe("assumption-constraints repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a non-empty description", async () => {
    await expect(
      createAssumptionConstraint({ projectId: 2, description: "  ", isValidated: false }, 7, "ProjectManager"),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createAssumptionConstraint(
      { projectId: 2, description: "An assumption about scope" },
      7,
      "ProjectManager",
    );
    expect(row.AssumptionConstraintId).toBe(1);
    expect(row.RowVer).toBe(42);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Description).toBe("An assumption about scope");
    expect(params.ActorUserId).toBe(7);
    expect(params.Type).toBeNull();
    expect(params.IsValidated).toBe(false);
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getAssumptionConstraintById(1, 7)).resolves.toMatchObject({
      Description: "An assumption about scope",
    });
  });

  it("list forwards ADR-0016 params with project scope and type filter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 8 })]);
    const params = listParamsSchema.parse({ page: "1" });
    const rows = await listAssumptionConstraints(params, 7, 2, { type: "Assumption" });
    expect(rows[0].TotalCount).toBe(8);
    expect(execProc).toHaveBeenCalledWith("usp_AssumptionConstraint_List", {
      ActorUserId: 7,
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 1,
      PageSize: 25,
      Type: "Assumption",
    });
  });

  it("list forwards null type filter when unset", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 8 })]);
    const params = listParamsSchema.parse({});
    await listAssumptionConstraints(params, 7, 2);
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.Type).toBeNull();
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([
      dbRow({ TotalCount: 1, AssumptionConstraintId: "not-a-number" }),
    ]);
    await expect(listAssumptionConstraints(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update carries rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateAssumptionConstraint(
      {
        assumptionConstraintId: 1,
        rowVer: 42,
        projectId: 2,
        description: "Updated description",
        isValidated: true,
      },
      7,
      "ProjectManager",
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Update");
    expect(params.RowVer).toBe(42);
    expect(params.AssumptionConstraintId).toBe(1);
    expect(params.IsValidated).toBe(true);
  });

  it("delete forwards ids and rowVer to the proc", async () => {
    execProc.mockResolvedValue([]);
    await deleteAssumptionConstraint(1, 42, 7, "ProjectManager");
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Delete");
    expect(params.AssumptionConstraintId).toBe(1);
    expect(params.RowVer).toBe(42);
    expect(params.ActorUserId).toBe(7);
    expect(params.ActorRole).toBe("ProjectManager");
  });
});
