"use server";

import { action } from "@/lib/action";
import {
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
} from "../repository/stakeholders";
import { stakeholderFormSchema, updateStakeholderFormSchema } from "../schemas/stakeholder-form";
import { deleteStakeholderInput } from "../schemas/stakeholder";

/** Create a stakeholder (RBAC stakeholders:create — project level checked in-proc, ADR-0021; audited in-proc). */
export const createStakeholderAction = action({
  name: "stakeholders.create",
  schema: stakeholderFormSchema,
  permission: "stakeholders:create",
  // Dynamic project-scoped path — the sheet calls router.refresh() on success
  revalidate: [],
  handler: (input, ctx) => createStakeholder(input, ctx.session.userId),
});

/** Update a stakeholder (RBAC stakeholders:update — project level checked in-proc, ADR-0021; audited in-proc). */
export const updateStakeholderAction = action({
  name: "stakeholders.update",
  schema: updateStakeholderFormSchema,
  permission: "stakeholders:update",
  revalidate: [],
  handler: (input, ctx) => updateStakeholder(input, ctx.session.userId),
});

/** Soft-delete a stakeholder (RBAC stakeholders:delete — project level checked in-proc, ADR-0021; audited in-proc). */
export const deleteStakeholderAction = action({
  name: "stakeholders.delete",
  schema: deleteStakeholderInput,
  permission: "stakeholders:delete",
  revalidate: [],
  handler: async (input, ctx) => {
    await deleteStakeholder(input.stakeholderId, input.rowVer, ctx.session.userId);
    return { stakeholderId: input.stakeholderId };
  },
});
