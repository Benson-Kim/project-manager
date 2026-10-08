"use server";

import { action } from "@/lib/action";
import {
  createKeyDeliverable,
  updateKeyDeliverable,
  deleteKeyDeliverable,
} from "../repository/key-deliverables";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";
import { deleteKeyDeliverableInput } from "../schemas/key-deliverable";

/**
 * Revalidation targets for all deliverable mutations.
 * `/projects/[id]/deliverables` and its Gantt sub-route are dynamic (session cookie)
 * so we use the bracket-segment pattern — Next.js revalidates every cached instance.
 * The Sheet component also calls router.refresh() for the current tab (ADR-0018).
 */
const REVALIDATE_TARGETS = ["/projects/[id]/deliverables", "/projects/[id]/deliverables/gantt"];

/** Create a deliverable (RBAC key-deliverables:create — project level checked in-proc, ADR-0021; audited in-proc). */
export const createKeyDeliverableAction = action({
  name: "key-deliverables.create",
  schema: keyDeliverableFormSchema,
  permission: "key-deliverables:create",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createKeyDeliverable(input, ctx.session.userId),
});

/** Update a deliverable (RBAC key-deliverables:update — project level checked in-proc, ADR-0021; CONFLICT on stale RowVer). */
export const updateKeyDeliverableAction = action({
  name: "key-deliverables.update",
  schema: updateKeyDeliverableFormSchema,
  permission: "key-deliverables:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => updateKeyDeliverable(input, ctx.session.userId),
});

/** Soft-delete a deliverable (RBAC key-deliverables:delete — project level checked in-proc, ADR-0021; audited in-proc). */
export const deleteKeyDeliverableAction = action({
  name: "key-deliverables.delete",
  schema: deleteKeyDeliverableInput,
  permission: "key-deliverables:delete",
  revalidate: REVALIDATE_TARGETS,
  handler: async (input, ctx) => {
    await deleteKeyDeliverable(input.keyDeliverableId, input.rowVer, ctx.session.userId);
    return { deleted: true as const };
  },
});
