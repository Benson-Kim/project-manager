"use server";

import { action } from "@/lib/action";
import { createSupplier } from "../repository/suppliers";
import { supplierFormSchema } from "../schemas/supplier-form";

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
  handler: (input, ctx) => createSupplier(input, ctx.session.userId),
});
