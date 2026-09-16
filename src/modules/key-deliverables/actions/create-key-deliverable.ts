"use server";

import { action } from "@/lib/action";
import { createKeyDeliverable } from "../repository/key-deliverables";
import { keyDeliverableFormSchema } from "../schemas/key-deliverable-form";

/** Create a deliverable (RBAC key-deliverables:create — Admin + PM; audited in-proc). */
export const createKeyDeliverableAction = action({
  name: "key-deliverables.create",
  schema: keyDeliverableFormSchema,
  permission: "key-deliverables:create",
  handler: (input, ctx) => createKeyDeliverable(input, ctx.session.userId),
});
