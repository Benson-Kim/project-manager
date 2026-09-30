import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createSupplierInput,
  supplierListRowSchema,
  supplierRowSchema,
  updateSupplierInput,
  type CreateSupplierInput,
  type CreateSupplierParsed,
  type SupplierFilters,
  type SupplierListRow,
  type SupplierRow,
  type UpdateSupplierInput,
} from "../schemas/supplier";

/**
 * Supplier repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 */

function toProcParams(input: CreateSupplierParsed) {
  return {
    ProjectId: input.projectId,
    SupplierName: input.supplierName,
    ContactPerson: input.contactPerson ?? null,
    EmailAddress: input.emailAddress ?? null,
    ContractStartDate: input.contractStartDate ?? null,
    ContractEndDate: input.contractEndDate ?? null,
    Rating: input.rating ?? null,
    Address: input.address ?? null,
    ProvinceOrState: input.provinceOrState ?? null,
    Country: input.country ?? null,
    PostalCode: input.postalCode ?? null,
    City: input.city ?? null,
  };
}

export async function createSupplier(
  input: CreateSupplierInput,
  actorUserId: number,
  actorRole: string,
): Promise<SupplierRow> {
  const parsed = createSupplierInput.parse(input);
  const rows = await execProc<SupplierRow>("usp_Supplier_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return supplierRowSchema.parse(rows[0]);
}

export async function getSupplierById(
  supplierId: number,
  actorUserId: number,
  actorRole: string,
): Promise<SupplierRow> {
  const rows = await execProc<SupplierRow>("usp_Supplier_GetById", {
    SupplierId: supplierId,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return supplierRowSchema.parse(rows[0]);
}

export async function listSuppliers(
  params: ListParams,
  actorUserId: number,
  actorRole: string,
  projectId: number | null = null,
  filters: SupplierFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<SupplierListRow[]> {
  const rows = await execProc<SupplierListRow>("usp_Supplier_List", {
    ActorUserId: actorUserId,
    ActorRole: actorRole,
    ProjectId: projectId,
    Rating: filters.rating ?? null,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => supplierListRowSchema.parse(r));
}

export async function updateSupplier(
  input: UpdateSupplierInput,
  actorUserId: number,
  actorRole: string,
): Promise<SupplierRow> {
  const parsed = updateSupplierInput.parse(input);
  const rows = await execProc<SupplierRow>("usp_Supplier_Update", {
    SupplierId: parsed.supplierId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return supplierRowSchema.parse(rows[0]);
}

export async function deleteSupplier(
  supplierId: number,
  rowVer: number,
  actorUserId: number,
  actorRole: string,
): Promise<void> {
  await execProc("usp_Supplier_Delete", {
    SupplierId: supplierId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
}
