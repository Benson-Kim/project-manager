"use server";

import { action } from "@/lib/action";
import { deleteStakeholder } from "../repository/stakeholders";
import { deleteStakeholderInput } from "../schemas/stakeholder";

/** Soft-delete a stakeholder (RBAC stakeholders:delete — Admin + PM; audited in-proc). */
export const deleteStakeholderAction = action({
  name: "stakeholders.delete",
  schema: deleteStakeholderInput,
  permission: "stakeholders:delete",
  revalidate: ["/stakeholders"],
  handler: async (input, ctx) => {
    await deleteStakeholder(input.stakeholderId, input.rowVer, ctx.session.userId);
    return { stakeholderId: input.stakeholderId };
  },
});
