import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import type { LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Supplier (app.Supplier ← tbl3rdPartySupplier) — zod contracts. Row schema
 * mirrors the SELECT shape of usp_Supplier_{Create,GetById,List,Update}.
 */

/** Dropdown list (module #7, ADR-0022; seed data uses Excellent/Good). */
export const SUPPLIER_LISTS = ["supplier.rating"] as const satisfies readonly LookupListKey[];

export const supplierRowSchema = z.object({
  SupplierId: z.number().int(),
  ProjectId: z.number().int(),
  SupplierName: z.string(),
  ContactPerson: z.string().nullable(),
  EmailAddress: z.string().nullable(),
  ContractStartDate: z.date().nullable(),
  ContractEndDate: z.date().nullable(),
  Rating: z.string().nullable(),
  Address: z.string().nullable(),
  ProvinceOrState: z.string().nullable(),
  Country: z.string().nullable(),
  PostalCode: z.string().nullable(),
  City: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type SupplierRow = z.infer<typeof supplierRowSchema>;

export const supplierListRowSchema = supplierRowSchema.extend({
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type SupplierListRow = z.infer<typeof supplierListRowSchema>;

export const createSupplierInput = z.object({
  projectId: z.number().int().positive(),
  supplierName: z.string().trim().min(1).max(255),
  contactPerson: z.string().trim().max(255).nullish(),
  emailAddress: z.string().trim().max(255).nullish(),
  contractStartDate: z.coerce.date().nullish(),
  contractEndDate: z.coerce.date().nullish(),
  rating: z.string().trim().max(255).nullish(),
  address: z.string().trim().max(255).nullish(),
  provinceOrState: z.string().trim().max(255).nullish(),
  country: z.string().trim().max(255).nullish(),
  postalCode: z.string().trim().max(255).nullish(),
  city: z.string().trim().max(255).nullish(),
});

export type CreateSupplierInput = z.input<typeof createSupplierInput>;
export type CreateSupplierParsed = z.infer<typeof createSupplierInput>;

export const updateSupplierInput = createSupplierInput.extend({
  supplierId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateSupplierInput = z.input<typeof updateSupplierInput>;

export const deleteSupplierInput = z.object({
  supplierId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteSupplierInput = z.input<typeof deleteSupplierInput>;

/** URL filter params for the suppliers list (rating facet). */
export const supplierFiltersSchema = z.object({
  rating: z.string().trim().optional(),
});

export type SupplierFilters = z.infer<typeof supplierFiltersSchema>;
