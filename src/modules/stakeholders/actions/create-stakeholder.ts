"use server";

import { action } from "@/lib/action";
import { createStakeholder } from "../repository/stakeholders";
import { stakeholderFormSchema } from "../schemas/stakeholder-form";

/** Create a stakeholder (RBAC stakeholders:create — Admin + PM; audited in-proc). */
export const createStakeholderAction = action({
  name: "stakeholders.create",
  schema: stakeholderFormSchema,
  permission: "stakeholders:create",
  revalidate: ["/stakeholders"],
  handler: (input, ctx) => createStakeholder(input, ctx.session.userId),
});
