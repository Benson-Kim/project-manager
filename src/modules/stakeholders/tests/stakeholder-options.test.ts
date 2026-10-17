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

  it("sends no actor role: the proc resolves it (ADR-0021)", async () => {
    execProc.mockResolvedValue([]);
    await listStakeholderOptions(2, 7);
    expect(execProc.mock.calls[0][1]).not.toHaveProperty("ActorRole");
  });
});
