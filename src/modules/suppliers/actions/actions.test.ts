import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "ProjectManager" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { AppError } from "@/lib/errors";
import { createSupplierAction } from "./create-supplier";
import { deleteSupplierAction } from "./delete-supplier";
import { updateSupplierAction } from "./update-supplier";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    SupplierId: 1,
    ProjectId: 2,
    SupplierName: "Fiverr Company",
    ContactPerson: null,
    EmailAddress: null,
    ContractStartDate: null,
    ContractEndDate: null,
    Rating: null,
    Address: null,
    ProvinceOrState: null,
    Country: null,
    PostalCode: null,
    City: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "10",
    ...overrides,
  };
}

describe("suppliers actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "ProjectManager" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData with coerced dates", async () => {
    execProc.mockResolvedValue([
      dbRow({ ContractStartDate: new Date("2024-12-26"), Rating: "Excellent" }),
    ]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("supplierName", "Fiverr Company");
    fd.set("contractStartDate", "2024-12-26");
    fd.set("rating", "Excellent");
    const result = await createSupplierAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.SupplierId).toBe(1);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Supplier_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ContractStartDate).toBeInstanceOf(Date);
    expect(params.Rating).toBe("Excellent");
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for an empty supplier name", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("supplierName", "  ");
    const result = await createSupplierAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.supplierName).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Viewer (RBAC via action())", async () => {
    session = { userId: 9, username: "viewer", role: "Viewer" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("supplierName", "Fiverr Company");
    const result = await createSupplierAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create is FORBIDDEN for a Contributor (Admin + PM only)", async () => {
    session = { userId: 8, username: "contrib", role: "Contributor" };
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("supplierName", "Fiverr Company");
    const result = await createSupplierAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Supplier was modified by someone else"));
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("supplierName", "Fiverr Company");
    fd.set("supplierId", "1");
    fd.set("rowVer", "9");
    const result = await updateSupplierAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteSupplierAction({ supplierId: 1, rowVer: 10 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Supplier_Delete", {
      SupplierId: 1,
      RowVer: 10,
      ActorUserId: 7,
    });
  });
});
