"use server";

import { action } from "@/lib/action";
import { updateSupplier } from "../repository/suppliers";
import { updateSupplierFormSchema } from "../schemas/supplier-form";

/** Update a supplier (RBAC suppliers:update — Admin + PM; audited in-proc). */
export const updateSupplierAction = action({
  name: "suppliers.update",
  schema: updateSupplierFormSchema,
  permission: "suppliers:update",
  handler: (input, ctx) => updateSupplier(input, ctx.session.userId),
});
