"use server";

import { action } from "@/lib/action";
import {
  createAssumptionConstraint,
  deleteAssumptionConstraint,
  updateAssumptionConstraint,
} from "../repository/assumption-constraints";
import {
  assumptionConstraintFormSchema,
  updateAssumptionConstraintFormSchema,
} from "../schemas/assumption-constraint-form";
import { deleteAssumptionConstraintInput } from "../schemas/assumption-constraint";

/**
 * Create an assumption/constraint (RBAC assumptions-constraints:create —
 * Admin + PM + Contributor; audited in-proc).
 * See rbac.ts CONTRIBUTOR_WRITE_MODULES.
 */
export const createAssumptionConstraintAction = action({
  name: "assumptions-constraints.create",
  schema: assumptionConstraintFormSchema,
  permission: "assumptions-constraints:create",
  handler: (input, ctx) =>
    createAssumptionConstraint(input, ctx.session.userId, ctx.session.role),
});

/**
 * Update an assumption/constraint (RBAC assumptions-constraints:update —
 * Admin + PM + Contributor; audited in-proc).
 */
export const updateAssumptionConstraintAction = action({
  name: "assumptions-constraints.update",
  schema: updateAssumptionConstraintFormSchema,
  permission: "assumptions-constraints:update",
  handler: (input, ctx) =>
    updateAssumptionConstraint(input, ctx.session.userId, ctx.session.role),
});

/**
 * Soft-delete an assumption/constraint (RBAC assumptions-constraints:delete —
 * Admin + PM only; audited in-proc).
 */
export const deleteAssumptionConstraintAction = action({
  name: "assumptions-constraints.delete",
  schema: deleteAssumptionConstraintInput,
  permission: "assumptions-constraints:delete",
  handler: async (input, ctx) => {
    await deleteAssumptionConstraint(
      input.assumptionConstraintId,
      input.rowVer,
      ctx.session.userId,
      ctx.session.role,
    );
    return { assumptionConstraintId: input.assumptionConstraintId };
  },
});
