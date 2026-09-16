"use server";

import { action } from "@/lib/action";
import { updateStakeholder } from "../repository/stakeholders";
import { updateStakeholderFormSchema } from "../schemas/stakeholder-form";

/** Update a stakeholder (RBAC stakeholders:update — Admin + PM; audited in-proc). */
export const updateStakeholderAction = action({
  name: "stakeholders.update",
  schema: updateStakeholderFormSchema,
  permission: "stakeholders:update",
  revalidate: ["/stakeholders"],
  handler: (input, ctx) => updateStakeholder(input, ctx.session.userId),
});
