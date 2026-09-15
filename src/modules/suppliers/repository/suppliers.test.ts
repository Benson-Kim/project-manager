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
      createSupplier({ projectId: 0, supplierName: "GTI Distributors" }, 7),
    ).rejects.toThrow();
    await expect(createSupplier({ projectId: 26, supplierName: " " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createSupplier({ projectId: 26, supplierName: "GTI Distributors" }, 7);
    expect(row.SupplierId).toBe(13);
    expect(row.RowVer).toBe(77);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Create");
    expect(params.ProjectId).toBe(26);
    expect(params.City).toBeNull();
    expect(params.ActorUserId).toBe(7);
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getSupplierById(13, 7)).resolves.toMatchObject({
      SupplierName: "GTI Distributors",
    });
  });

  it("list forwards the ADR-0016 params with the project scope filter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 12 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listSuppliers(params, 7, 26);
    expect(rows[0].TotalCount).toBe(12);
    expect(execProc).toHaveBeenCalledWith("usp_Supplier_List", {
      ActorUserId: 7,
      ProjectId: 26,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
    });
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 12, SupplierName: 42 })]);
    await expect(listSuppliers(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update and delete carry rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateSupplier({ supplierId: 13, rowVer: 77, projectId: 26, supplierName: "GTI" }, 7);
    let [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Update");
    expect(params.RowVer).toBe(77);

    execProc.mockResolvedValue([]);
    await deleteSupplier(13, 77, 7);
    [proc, params] = execProc.mock.calls[1] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Delete");
    expect(params.SupplierId).toBe(13);
  });
});
