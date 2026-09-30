import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createSupplier,
  deleteSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
} from "./suppliers";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    SupplierId: 13,
    ProjectId: 26,
    SupplierName: "GTI Distributors",
    ContactPerson: "Eunice Taylor",
    EmailAddress: "info@gtidistributors.com",
    ContractStartDate: new Date("2024-12-26"),
    ContractEndDate: new Date("2024-12-17"),
    Rating: "Excellent",
    Address: "617 Annex Avenue",
    ProvinceOrState: null,
    Country: "Canada",
    PostalCode: "87680",
    City: "Toronto",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "77",
    ...overrides,
  };
}

describe("suppliers repository (child entity of Project)", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a project id and a supplier name", async () => {
    await expect(
      createSupplier({ projectId: 0, supplierName: "GTI Distributors" }, 7, "ProjectManager"),
    ).rejects.toThrow();
    await expect(
      createSupplier({ projectId: 26, supplierName: " " }, 7, "ProjectManager"),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params including ActorRole and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createSupplier(
      { projectId: 26, supplierName: "GTI Distributors" },
      7,
      "ProjectManager",
    );
    expect(row.SupplierId).toBe(13);
    expect(row.RowVer).toBe(77);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Create");
    expect(params.ProjectId).toBe(26);
    expect(params.City).toBeNull();
    expect(params.ActorUserId).toBe(7);
    expect(params.ActorRole).toBe("ProjectManager");
  });

  it("getById parses the row and forwards ActorRole", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getSupplierById(13, 7, "ProjectManager")).resolves.toMatchObject({
      SupplierName: "GTI Distributors",
    });
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ActorRole).toBe("ProjectManager");
  });

  it("list forwards the ADR-0016 params with project scope, ActorRole and no rating filter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 12 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listSuppliers(params, 7, "ProjectManager", 26);
    expect(rows[0].TotalCount).toBe(12);
    expect(execProc).toHaveBeenCalledWith("usp_Supplier_List", {
      ActorUserId: 7,
      ActorRole: "ProjectManager",
      ProjectId: 26,
      Rating: null,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
    });
  });

  it("list forwards a rating filter to the proc", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 3 })]);
    const params = listParamsSchema.parse({});
    await listSuppliers(params, 7, "ProjectManager", 26, { rating: "Excellent" });
    const [, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(procParams.Rating).toBe("Excellent");
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 12, SupplierName: 42 })]);
    await expect(
      listSuppliers(listParamsSchema.parse({}), 7, "ProjectManager"),
    ).rejects.toThrow();
  });

  it("update and delete carry rowVer for optimistic concurrency and forward ActorRole", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateSupplier(
      { supplierId: 13, rowVer: 77, projectId: 26, supplierName: "GTI" },
      7,
      "ProjectManager",
    );
    let [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Update");
    expect(params.RowVer).toBe(77);
    expect(params.ActorRole).toBe("ProjectManager");

    execProc.mockResolvedValue([]);
    await deleteSupplier(13, 77, 7, "ProjectManager");
    [proc, params] = execProc.mock.calls[1] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Delete");
    expect(params.SupplierId).toBe(13);
    expect(params.ActorRole).toBe("ProjectManager");
  });
});
