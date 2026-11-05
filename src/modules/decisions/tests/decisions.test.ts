import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  createDecision,
  deleteDecision,
  getDecisionById,
  listDecisionOptions,
  listDecisions,
  updateDecision,
} from "../repository/decisions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    DecisionId: 1,
    ProjectId: 2,
    DecisionNumber: 3,
    Title: "Pick the hosting vendor",
    DateLogged: new Date("2026-03-01T00:00:00Z"),
    OwnerStakeholderId: null,
    Status: "Approved",
    ProblemContext: null,
    OptionsConsidered: null,
    Rationale: null,
    NextSteps: null,
    SupersededByDecisionId: null,
    ImpactedAreas: null,
    ConsultedStakeholderIds: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

const args = () => execProc.mock.calls[0][1] as Record<string, unknown>;

describe("decisions repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a non-empty title", async () => {
    await expect(createDecision({ projectId: 2, title: "  " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create always states both sets, so NULL never reaches the replace procs", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createDecision({ projectId: 2, title: "Pick the hosting vendor" }, 7);
    expect(args().ImpactedAreas).toBe("[]");
    expect(args().StakeholderIds).toBe("[]");
  });

  it("create forwards every field and parses the returned row", async () => {
    execProc.mockResolvedValue([
      dbRow({
        ImpactedAreas: '[{"label":"Budget"},{"label":"Scope"}]',
        ConsultedStakeholderIds: '[{"id":5},{"id":9}]',
      }),
    ]);
    const row = await createDecision(
      {
        projectId: 2,
        title: "Pick the hosting vendor",
        status: "Approved",
        dateLogged: new Date("2026-03-01T00:00:00Z"),
        ownerStakeholderId: 4,
        supersededByDecisionId: 8,
        impactedAreas: ["Budget", "Scope"],
        consultedStakeholderIds: [5, 9],
      },
      7,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_Decision_Create");
    expect(args()).toMatchObject({
      ProjectId: 2,
      Title: "Pick the hosting vendor",
      Status: "Approved",
      OwnerStakeholderId: 4,
      SupersededByDecisionId: 8,
      ImpactedAreas: '["Budget","Scope"]',
      StakeholderIds: "[5,9]",
      ActorUserId: 7,
    });
    // Both sets travel on the decision's own row as JSON, so one read serves the form.
    expect(row.ImpactedAreas).toEqual(["Budget", "Scope"]);
    expect(row.ConsultedStakeholderIds).toEqual([5, 9]);
  });

  it("an empty set comes back as the empty array, not null", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await getDecisionById(1, 7);
    expect(row.ImpactedAreas).toEqual([]);
    expect(row.ConsultedStakeholderIds).toEqual([]);
  });

  it("update replaces a set only when one was sent", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateDecision(
      { decisionId: 1, rowVer: 42, title: "Pick the hosting vendor", impactedAreas: ["Budget"] },
      7,
    );
    expect(args()).toMatchObject({
      ImpactedAreasSet: 1,
      ImpactedAreas: '["Budget"]',
      StakeholderIdsSet: 0,
      StakeholderIds: null,
    });
  });

  it("update sending an empty array empties that set, which is not the same as leaving it", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateDecision(
      {
        decisionId: 1,
        rowVer: 42,
        title: "Pick the hosting vendor",
        impactedAreas: [],
        consultedStakeholderIds: [],
      },
      7,
    );
    expect(args()).toMatchObject({
      ImpactedAreasSet: 1,
      ImpactedAreas: "[]",
      StakeholderIdsSet: 1,
      StakeholderIds: "[]",
    });
  });

  it("update never moves a decision between projects", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateDecision(
      // @ts-expect-error a project cannot be sent: usp_Decision_Update takes none
      { decisionId: 1, rowVer: 42, title: "Pick the hosting vendor", projectId: 99 },
      7,
    );
    expect(args()).not.toHaveProperty("ProjectId");
  });

  it("list forwards the filters and the page", async () => {
    execProc.mockResolvedValue([]);
    await listDecisions(
      { page: 2, dir: "desc", q: "vendor" },
      7,
      2,
      { status: "Approved", impactedArea: "Budget" },
      25,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_Decision_List");
    expect(args()).toMatchObject({
      ActorUserId: 7,
      ProjectId: 2,
      Status: "Approved",
      ImpactedArea: "Budget",
    });
  });

  it("delete sends the row version so a stale delete conflicts", async () => {
    execProc.mockResolvedValue([]);
    await deleteDecision(1, 42, 7);
    expect(execProc.mock.calls[0][0]).toBe("usp_Decision_Delete");
    expect(args()).toMatchObject({ DecisionId: 1, RowVer: 42, ActorUserId: 7 });
  });

  it("the supersession picker leaves out the decision being edited", async () => {
    execProc.mockResolvedValue([
      { ...dbRow(), TotalCount: 2, ActorAccess: null, ActorGrants: null, ActorRevokes: null },
      {
        ...dbRow({ DecisionId: 5, DecisionNumber: 4, Title: "Renew the licence" }),
        TotalCount: 2,
        ActorAccess: null,
        ActorGrants: null,
        ActorRevokes: null,
      },
    ]);
    const options = await listDecisionOptions(2, 7, 1);
    expect(options).toEqual([{ id: 5, label: "DEC-004 Renew the licence" }]);
  });
  it("the supersession picker reads every page, so a target past the first 100 is kept", async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...dbRow({ DecisionId: from + i, DecisionNumber: from + i, Title: "T" }),
        TotalCount: 130,
        ActorAccess: null,
        ActorGrants: null,
        ActorRevokes: null,
      }));
    execProc.mockResolvedValueOnce(page(1, 100)).mockResolvedValueOnce(page(101, 30));
    const options = await listDecisionOptions(2, 7, null);
    expect(options).toHaveLength(130);
    expect(options.at(-1)).toEqual({ id: 130, label: "DEC-130 T" });
    expect(execProc.mock.calls.map((c) => (c[1] as Record<string, unknown>).Page)).toEqual([1, 2]);
  });
});
