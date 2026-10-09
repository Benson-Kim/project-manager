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

  // ── create ──────────────────────────────────────────────────────────────────

  it("create requires a non-empty description", async () => {
    await expect(
      createAssumptionConstraint({ projectId: 2, description: "  ", isValidated: false }, 7),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createAssumptionConstraint(
      { projectId: 2, description: "An assumption about scope" },
      7,
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

  it("create forwards type=Constraint", async () => {
    execProc.mockResolvedValue([dbRow({ Type: "Constraint" })]);
    await createAssumptionConstraint(
      { projectId: 2, description: "A hard constraint", type: "Constraint" },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Type).toBe("Constraint");
  });

  it("create forwards impact=Medium", async () => {
    execProc.mockResolvedValue([dbRow({ Impact: "Medium" })]);
    await createAssumptionConstraint(
      { projectId: 2, description: "An assumption", impact: "Medium" },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Impact).toBe("Medium");
  });

  it("create forwards impact=Low", async () => {
    execProc.mockResolvedValue([dbRow({ Impact: "Low" })]);
    await createAssumptionConstraint(
      { projectId: 2, description: "An assumption", impact: "Low" },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Impact).toBe("Low");
  });

  it("create forwards isValidated=true", async () => {
    execProc.mockResolvedValue([dbRow({ IsValidated: true })]);
    await createAssumptionConstraint(
      { projectId: 2, description: "Verified assumption", isValidated: true },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.IsValidated).toBe(true);
  });

  it("create throws INTERNAL when proc returns empty result", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      createAssumptionConstraint({ projectId: 2, description: "Test" }, 7),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getAssumptionConstraintById(1, 7)).resolves.toMatchObject({
      Description: "An assumption about scope",
    });
  });

  it("getById sends no role to the proc (ADR-0021)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getAssumptionConstraintById(1, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("getById throws NOT_FOUND when proc returns empty", async () => {
    execProc.mockResolvedValue([]);
    await expect(getAssumptionConstraintById(999, 7)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

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

  it("list forwards the search query parameter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    const params = listParamsSchema.parse({ q: "assumption about scope" });
    await listAssumptionConstraints(params, 7, 2);
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.Search).toBe("assumption about scope");
  });

  it("list forwards sort parameters", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    const params = listParamsSchema.parse({ sort: "Type", dir: "desc" });
    await listAssumptionConstraints(params, 7, 2);
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.SortBy).toBe("Type");
    expect(procParams.SortDir).toBe("desc");
  });

  it("list handles pagination — page 2", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 30 })]);
    const params = listParamsSchema.parse({ page: "2" });
    await listAssumptionConstraints(params, 7, 2);
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.Page).toBe(2);
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1, AssumptionConstraintId: "not-a-number" })]);
    await expect(listAssumptionConstraints(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  // ── update ────────────────────────────────────────────────────────────────

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
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Update");
    expect(params.RowVer).toBe(42);
    expect(params.AssumptionConstraintId).toBe(1);
    expect(params.IsValidated).toBe(true);
  });

  it("update throws INTERNAL when proc returns empty", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      updateAssumptionConstraint(
        {
          assumptionConstraintId: 1,
          rowVer: 42,
          projectId: 2,
          description: "Test",
          isValidated: false,
        },
        7,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete forwards ids and rowVer to the proc", async () => {
    execProc.mockResolvedValue([]);
    await deleteAssumptionConstraint(1, 42, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_AssumptionConstraint_Delete");
    expect(params.AssumptionConstraintId).toBe(1);
    expect(params.RowVer).toBe(42);
    expect(params.ActorUserId).toBe(7);
    expect(params).not.toHaveProperty("ActorRole");
  });
});
