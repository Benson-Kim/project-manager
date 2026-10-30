import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createRiskIssue,
  deleteRiskIssue,
  getRiskIssueById,
  listRiskIssues,
  updateRiskIssue,
} from "../repository/risk-issues";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    RiskIssueId: 1,
    ProjectId: 2,
    Description: "<p>The vendor may be late</p>",
    Category: "Risk",
    DateIdentified: new Date("2026-03-01T00:00:00Z"),
    Status: "Open",
    Priority: "High",
    Impact: "Low",
    Probability: "High",
    MitigationPlan: null,
    Owner: null,
    DueDate: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

const minimal = { projectId: 2, description: "The vendor may be late" };

describe("risk-issues repository", () => {
  beforeEach(() => execProc.mockReset());

  // ── create ────────────────────────────────────────────────────────────────

  it("create requires a non-empty description", async () => {
    await expect(createRiskIssue({ projectId: 2, description: "  " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards every field and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createRiskIssue(
      {
        ...minimal,
        category: "Risk",
        status: "Open",
        priority: "High",
        impact: "Low",
        probability: "High",
        owner: "Dana",
        dateIdentified: "2026-03-01",
        dueDate: "2026-04-01",
        mitigationPlan: "<p>Hold a buffer</p>",
      },
      7,
    );
    expect(row.RiskIssueId).toBe(1);
    expect(row.RowVer).toBe(42);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_RiskIssue_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Category).toBe("Risk");
    expect(params.Status).toBe("Open");
    expect(params.Priority).toBe("High");
    expect(params.Impact).toBe("Low");
    expect(params.Probability).toBe("High");
    expect(params.Owner).toBe("Dana");
    expect(params.MitigationPlan).toBe("<p>Hold a buffer</p>");
    expect(params.DateIdentified).toEqual(new Date("2026-03-01"));
    expect(params.DueDate).toEqual(new Date("2026-04-01"));
    expect(params.ActorUserId).toBe(7);
    // The proc reads the actor's role from auth.User; the caller never sends it (ADR-0021).
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("create sends NULL for every omitted optional field", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createRiskIssue(minimal, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    for (const key of [
      "Category",
      "Status",
      "Priority",
      "Impact",
      "Probability",
      "Owner",
      "MitigationPlan",
      "DateIdentified",
      "DueDate",
    ]) {
      expect(params[key], key).toBeNull();
    }
  });

  it("create throws INTERNAL when the proc returns no rows", async () => {
    execProc.mockResolvedValue([]);
    await expect(createRiskIssue(minimal, 7)).rejects.toMatchObject({ code: "INTERNAL" });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  it("getById parses the row and sends no role", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getRiskIssueById(1, 7)).resolves.toMatchObject({ Category: "Risk" });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_RiskIssue_GetById");
    expect(params).toEqual({ RiskIssueId: 1, ActorUserId: 7 });
  });

  it("getById throws NOT_FOUND when the proc returns no rows", async () => {
    execProc.mockResolvedValue([]);
    await expect(getRiskIssueById(1, 7)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it("list forwards the list params, the project and both filters", async () => {
    execProc.mockResolvedValue([
      { ...dbRow(), TotalCount: 1, ActorAccess: "Manager", ActorGrants: null, ActorRevokes: null },
    ]);
    const params = listParamsSchema.parse({ q: "vendor", sort: "DueDate", dir: "desc", page: "2" });
    const rows = await listRiskIssues(params, 7, 2, { category: "Risk", status: "Open" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ActorAccess).toBe("Manager");
    const [proc, sent] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_RiskIssue_List");
    expect(sent.ProjectId).toBe(2);
    expect(sent.Search).toBe("vendor");
    expect(sent.SortBy).toBe("DueDate");
    expect(sent.SortDir).toBe("desc");
    expect(sent.Page).toBe(2);
    expect(sent.Category).toBe("Risk");
    expect(sent.Status).toBe("Open");
  });

  it("list sends NULL for an absent project and absent filters", async () => {
    execProc.mockResolvedValue([]);
    await listRiskIssues(listParamsSchema.parse({}), 7);
    const [, sent] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(sent.ProjectId).toBeNull();
    expect(sent.Category).toBeNull();
    expect(sent.Status).toBeNull();
  });

  // ── update ────────────────────────────────────────────────────────────────

  it("update forwards the id and rowVer", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateRiskIssue({ ...minimal, riskIssueId: 1, rowVer: 42 }, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_RiskIssue_Update");
    expect(params.RiskIssueId).toBe(1);
    expect(params.RowVer).toBe(42);
    expect(params.ActorUserId).toBe(7);
  });

  it("update throws INTERNAL when the proc returns no rows", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      updateRiskIssue({ ...minimal, riskIssueId: 1, rowVer: 42 }, 7),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete forwards the id and rowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteRiskIssue(1, 42, 7);
    expect(execProc).toHaveBeenCalledWith("usp_RiskIssue_Delete", {
      RiskIssueId: 1,
      RowVer: 42,
      ActorUserId: 7,
    });
  });
});
