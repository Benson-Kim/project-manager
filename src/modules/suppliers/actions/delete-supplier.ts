"use server";

import { action } from "@/lib/action";
import { deleteSupplier } from "../repository/suppliers";
import { deleteSupplierInput } from "../schemas/supplier";

/** Soft-delete a supplier (RBAC suppliers:delete — Admin + PM; audited in-proc). */
export const deleteSupplierAction = action({
  name: "suppliers.delete",
  schema: deleteSupplierInput,
  permission: "suppliers:delete",
  handler: async (input, ctx) => {
    await deleteSupplier(input.supplierId, input.rowVer, ctx.session.userId);
    return { supplierId: input.supplierId };
  },
});
