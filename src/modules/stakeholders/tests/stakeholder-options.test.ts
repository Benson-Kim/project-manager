import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listStakeholderOptions } from "../repository/stakeholder-options";

beforeEach(() => execProc.mockReset());

describe("stakeholder picker options", () => {
  it("lists the project's stakeholders by last name through the scoped list proc", async () => {
    execProc.mockResolvedValue([
      { StakeholderId: 1, FirstName: "Gary", LastName: "Cantrall", EmailAddress: "g@x.test" },
      { StakeholderId: 9, FirstName: "Ministry of Education", LastName: null },
    ]);
    const options = await listStakeholderOptions(2, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Stakeholder_List", {
      ActorUserId: 7,
      ProjectId: 2,
      Search: null,
      SortBy: "LastName",
      SortDir: "asc",
      Page: 1,
      PageSize: 100,
    });
    expect(options).toEqual([
      { stakeholderId: 1, name: "Gary Cantrall" },
      { stakeholderId: 9, name: "Ministry of Education" },
    ]);
  });

  it("reads every page when a project has more stakeholders than one page holds", async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        StakeholderId: from + i,
        FirstName: `S${from + i}`,
        LastName: null,
      }));
    execProc.mockResolvedValueOnce(page(1, 100)).mockResolvedValueOnce(page(101, 3));
    const options = await listStakeholderOptions(2, 7);
    expect(execProc).toHaveBeenCalledTimes(2);
    expect(execProc.mock.calls.map((c) => (c[1] as { Page: number }).Page)).toEqual([1, 2]);
    expect(options).toHaveLength(103);
    expect(options.at(-1)).toEqual({ stakeholderId: 103, name: "S103" });
  });

  it("stops at its page cap even if every page comes back full", async () => {
    execProc.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ StakeholderId: i, FirstName: "S", LastName: null })),
    );
    await listStakeholderOptions(2, 7);
    expect(execProc).toHaveBeenCalledTimes(50);
  });

  it("sends no actor role: the proc resolves it (ADR-0021)", async () => {
    execProc.mockResolvedValue([]);
    await listStakeholderOptions(2, 7);
    expect(execProc.mock.calls[0][1]).not.toHaveProperty("ActorRole");
  });
});
