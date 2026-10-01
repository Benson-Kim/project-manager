import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createParkingLotItem,
  deleteParkingLotItem,
  getParkingLotItemById,
  listParkingLotItems,
  updateParkingLotItem,
} from "./parking-lot-items";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ParkingLotItemId: 3,
    ProjectId: 2,
    ParkingLotItem: "Something to discuss",
    StakeholderId: 1,
    IsStrikethrough: false,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("parking-lot-items repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a non-empty item", async () => {
    await expect(
      createParkingLotItem({ projectId: 2, parkingLotItem: "  ", isStrikethrough: false }, 7),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createParkingLotItem(
      { projectId: 2, parkingLotItem: "Something to discuss" },
      7,
    );
    expect(row.ParkingLotItemId).toBe(3);
    expect(row.RowVer).toBe(42);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ParkingLotItem_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ParkingLotItem).toBe("Something to discuss");
    expect(params.ActorUserId).toBe(7);
    expect(params.StakeholderId).toBeNull();
    expect(params.IsStrikethrough).toBe(false);
  });

  it("create forwards optional stakeholderId when provided", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createParkingLotItem(
      { projectId: 2, parkingLotItem: "Item", stakeholderId: 3 },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.StakeholderId).toBe(3);
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getParkingLotItemById(3, 1)).resolves.toMatchObject({
      ParkingLotItem: "Something to discuss",
    });
  });

  it("list forwards ADR-0016 params with project scope", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 5 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listParkingLotItems(params, 1, 2);
    expect(rows[0].TotalCount).toBe(5);
    expect(execProc).toHaveBeenCalledWith("usp_ParkingLotItem_List", {
      ActorUserId: 1,
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
      IsStrikethrough: null,
    });
  });

  it("list forwards IsStrikethrough filter=true", async () => {
    execProc.mockResolvedValue([dbRow({ IsStrikethrough: true, TotalCount: 1 })]);
    const params = listParamsSchema.parse({});
    await listParkingLotItems(params, 1, 2, { isStrikethrough: true });
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.IsStrikethrough).toBe(true);
  });

  it("list forwards IsStrikethrough filter=false", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    const params = listParamsSchema.parse({});
    await listParkingLotItems(params, 1, 2, { isStrikethrough: false });
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.IsStrikethrough).toBe(false);
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1, ParkingLotItemId: "not-a-number" })]);
    await expect(listParkingLotItems(listParamsSchema.parse({}), 1)).rejects.toThrow();
  });

  it("update carries rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateParkingLotItem(
      {
        parkingLotItemId: 3,
        rowVer: 42,
        projectId: 2,
        parkingLotItem: "Updated item",
        isStrikethrough: true,
      },
      1,
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ParkingLotItem_Update");
    expect(params.RowVer).toBe(42);
    expect(params.ParkingLotItemId).toBe(3);
    expect(params.IsStrikethrough).toBe(true);
  });

  it("delete forwards ids and rowVer to the proc", async () => {
    execProc.mockResolvedValue([]);
    await deleteParkingLotItem(3, 42, 1);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ParkingLotItem_Delete");
    expect(params.ParkingLotItemId).toBe(3);
    expect(params.RowVer).toBe(42);
    expect(params.ActorUserId).toBe(1);
  });
});
