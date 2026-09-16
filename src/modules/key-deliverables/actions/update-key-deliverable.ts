"use server";

import { action } from "@/lib/action";
import { updateKeyDeliverable } from "../repository/key-deliverables";
import { updateKeyDeliverableFormSchema } from "../schemas/key-deliverable-form";

/** Update a deliverable (RBAC key-deliverables:update — Admin + PM; CONFLICT on stale RowVer). */
export const updateKeyDeliverableAction = action({
  name: "key-deliverables.update",
  schema: updateKeyDeliverableFormSchema,
  permission: "key-deliverables:update",
  handler: (input, ctx) => updateKeyDeliverable(input, ctx.session.userId),
});
