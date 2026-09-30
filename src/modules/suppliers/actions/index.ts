"use server";

import { action } from "@/lib/action";
import { createSupplier, updateSupplier, deleteSupplier } from "../repository/suppliers";
import { supplierFormSchema, updateSupplierFormSchema } from "../schemas/supplier-form";
import { deleteSupplierInput } from "../schemas/supplier";

/**
 * Create a supplier (RBAC suppliers:create — Admin + PM; audited in-proc).
 * The suppliers page is dynamic (session cookie) and the sheet calls
 * router.refresh() on success — no static path to revalidate (ADR-0018
 * project-scoped route).
 */
export const createSupplierAction = action({
  name: "suppliers.create",
  schema: supplierFormSchema,
  permission: "suppliers:create",
  handler: (input, ctx) => createSupplier(input, ctx.session.userId, ctx.session.role),
});

/** Update a supplier (RBAC suppliers:update — Admin + PM; audited in-proc). */
export const updateSupplierAction = action({
  name: "suppliers.update",
  schema: updateSupplierFormSchema,
  permission: "suppliers:update",
  handler: (input, ctx) => updateSupplier(input, ctx.session.userId, ctx.session.role),
});

/** Soft-delete a supplier (RBAC suppliers:delete — Admin + PM; audited in-proc). */
export const deleteSupplierAction = action({
  name: "suppliers.delete",
  schema: deleteSupplierInput,
  permission: "suppliers:delete",
  handler: async (input, ctx) => {
    await deleteSupplier(input.supplierId, input.rowVer, ctx.session.userId, ctx.session.role);
    return { supplierId: input.supplierId };
  },
});
