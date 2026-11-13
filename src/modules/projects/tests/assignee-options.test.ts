import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listAssigneeOptions } from "../repository/assignee-options";

const page = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    StakeholderId: from + i,
    FirstName: "Person",
    LastName: String(from + i),
  }));

beforeEach(() => execProc.mockReset());

describe("team editor stakeholder names", () => {
  it("names every stakeholder, past the first page of 100", async () => {
    execProc.mockResolvedValueOnce(page(1, 100)).mockResolvedValueOnce(page(101, 5));
    const names = await listAssigneeOptions(2, 7);
    expect(execProc).toHaveBeenCalledTimes(2);
    expect(execProc).toHaveBeenLastCalledWith(
      "usp_Stakeholder_List",
      expect.objectContaining({ ProjectId: 2, ActorUserId: 7, Page: 2, PageSize: 100 }),
    );
    expect(names).toHaveLength(105);
    expect(names.at(-1)).toBe("Person 105");
  });

  it("lists a shared name once", async () => {
    execProc.mockResolvedValueOnce([
      { StakeholderId: 1, FirstName: "Sam", LastName: "Lee" },
      { StakeholderId: 2, FirstName: "Sam", LastName: "Lee" },
      { StakeholderId: 3, FirstName: "Ministry of Education", LastName: null },
    ]);
    expect(await listAssigneeOptions(2, 7)).toEqual(["Sam Lee", "Ministry of Education"]);
  });
});
