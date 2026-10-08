import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { getLookupLists, saveLookupList } from "../repository/lookup-lists";

const dbRow = (overrides: Record<string, unknown> = {}) => ({
  ListKey: "supplier.rating",
  ListRowVer: "31",
  LookupOptionId: 4,
  Label: "Good",
  SortOrder: 1,
  IsLocked: false,
  ...overrides,
});

describe("lookup-lists repository (ADR-0022)", () => {
  beforeEach(() => {
    execProc.mockReset();
  });

  it("reads several lists in one call, keys de-duplicated", async () => {
    execProc.mockResolvedValue([
      dbRow(),
      dbRow({ ListKey: "project.status", ListRowVer: 2, LookupOptionId: 9, Label: "On hold" }),
    ]);
    const lists = await getLookupLists(["supplier.rating", "project.status", "supplier.rating"], 7);
    expect(execProc).toHaveBeenCalledWith("usp_LookupList_GetOptions", {
      ActorUserId: 7,
      ListKeys: JSON.stringify(["supplier.rating", "project.status"]),
    });
    expect(lists["supplier.rating"]).toEqual({
      key: "supplier.rating",
      rowVer: 31,
      options: [{ id: 4, label: "Good", locked: false }],
    });
    expect(lists["project.status"]?.options[0].label).toBe("On hold");
  });

  it("skips the database when no list is asked for", async () => {
    expect(await getLookupLists([], 7)).toEqual({});
    expect(execProc).not.toHaveBeenCalled();
  });

  it("rejects rows that break the contract", async () => {
    execProc.mockResolvedValue([dbRow({ ListKey: "unknown.list" })]);
    await expect(getLookupLists(["supplier.rating"], 7)).rejects.toThrow();
  });

  it("saves a whole list and returns it as saved", async () => {
    execProc.mockResolvedValue([
      dbRow({ ListRowVer: 32 }),
      dbRow({ LookupOptionId: 11, Label: "Great", SortOrder: 2 }),
    ]);
    const list = await saveLookupList(
      {
        listKey: "supplier.rating",
        rowVer: 31,
        options: [
          { id: 4, label: " Good " },
          { id: null, label: "Great" },
        ],
      },
      1,
    );
    expect(execProc).toHaveBeenCalledWith("usp_LookupList_Set", {
      ListKey: "supplier.rating",
      OptionsJson: JSON.stringify([
        { id: 4, label: "Good" },
        { id: null, label: "Great" },
      ]),
      RowVer: 31,
      ActorUserId: 1,
    });
    expect(list.rowVer).toBe(32);
    expect(list.options.map((o) => o.label)).toEqual(["Good", "Great"]);
  });

  it("validates before touching the database", async () => {
    await expect(
      saveLookupList(
        { listKey: "supplier.rating", rowVer: 1, options: [{ id: null, label: "" }] },
        1,
      ),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("fails loudly when the proc returns no list", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      saveLookupList({ listKey: "supplier.rating", rowVer: 1, options: [] }, 1),
    ).rejects.toThrow(/no rows/);
  });
});
