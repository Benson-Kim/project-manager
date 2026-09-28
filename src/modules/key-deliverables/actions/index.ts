"use server";

import { action } from "@/lib/action";
import { createKeyDeliverable, updateKeyDeliverable, deleteKeyDeliverable } from "../repository/key-deliverables";
import { keyDeliverableFormSchema, updateKeyDeliverableFormSchema } from "../schemas/key-deliverable-form";
import { deleteKeyDeliverableInput } from "../schemas/key-deliverable";

/** Create a deliverable (RBAC key-deliverables:create — Admin + PM; audited in-proc). */
export const createKeyDeliverableAction = action({
  name: "key-deliverables.create",
  schema: keyDeliverableFormSchema,
  permission: "key-deliverables:create",
  handler: (input, ctx) => createKeyDeliverable(input, ctx.session.userId),
});


/** Update a deliverable (RBAC key-deliverables:update — Admin + PM; CONFLICT on stale RowVer). */
export const updateKeyDeliverableAction = action({
  name: "key-deliverables.update",
  schema: updateKeyDeliverableFormSchema,
  permission: "key-deliverables:update",
  handler: (input, ctx) => updateKeyDeliverable(input, ctx.session.userId),
});


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
