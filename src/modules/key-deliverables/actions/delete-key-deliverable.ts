"use server";

import { action } from "@/lib/action";
import { deleteKeyDeliverable } from "../repository/key-deliverables";
import { deleteKeyDeliverableInput } from "../schemas/key-deliverable";

/** Soft-delete a deliverable (RBAC key-deliverables:delete — Admin + PM; audited in-proc). */
export const deleteKeyDeliverableAction = action({
  name: "key-deliverables.delete",
  schema: deleteKeyDeliverableInput,
  permission: "key-deliverables:delete",
  handler: async (input, ctx) => {
    await deleteKeyDeliverable(input.keyDeliverableId, input.rowVer, ctx.session.userId);
    return { deleted: true as const };
  },
});
