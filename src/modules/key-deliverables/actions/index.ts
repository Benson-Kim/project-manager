"use server";

import { action } from "@/lib/action";
import {
  addCascadeRequirement,
  createKeyDeliverable,
  updateKeyDeliverable,
  deleteKeyDeliverable,
  removeCascadeRequirement,
  deleteWbsItem,
  getWbs,
  moveKeyDeliverable,
  moveCascadeRequirement,
  renameKeyDeliverable,
  rescheduleKeyDeliverable,
  setWbsItemStatus,
  updateCascadeRequirement,
} from "../repository/key-deliverables";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";
import {
  addRequirementInput,
  addWbsItemInput,
  deleteKeyDeliverableInput,
  removeRequirementInput,
  deleteWbsItemInput,
  moveRequirementInput,
  moveWbsItemInput,
  renameWbsItemInput,
  rescheduleWbsItemInput,
  setWbsStatusInput,
  updateRequirementInput,
} from "../schemas/key-deliverable";

/**
 * Revalidation targets for all deliverable mutations.
 * `/projects/[id]/deliverables` and its Gantt sub-route are dynamic (session cookie);
 * the targets are route patterns, which action() revalidates as pages so every
 * rendered instance is reached. The Sheet component also calls router.refresh()
 * for the current tab (ADR-0018).
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

/*
 * Work breakdown editor (ADR-0027). Each edit answers with the project's whole
 * breakdown, which the editor shows in place of its own guess, so these do not
 * revalidate: the page is dynamic and nothing else on it changes.
 */

/** Add an item under a parent, after a sibling or last; answers with its id too. */
export const addWbsItemAction = action({
  name: "key-deliverables.wbs-add",
  schema: addWbsItemInput,
  permission: "key-deliverables:create",
  handler: async (input, ctx) => {
    const row = await createKeyDeliverable(
      {
        projectId: input.projectId,
        keyRequirement: input.name,
        startDate: input.start,
        deadline: input.end,
        parentId: input.parentId,
        afterId: input.afterId,
      },
      ctx.session.userId,
    );
    const wbs = await getWbs(input.projectId, ctx.session.userId);
    return { id: row.KeyDeliverableId, ...wbs };
  },
});

/** Indent, outdent, move up or down: a new parent and place among its children. */
export const moveWbsItemAction = action({
  name: "key-deliverables.wbs-move",
  schema: moveWbsItemInput,
  permission: "key-deliverables:update",
  handler: (input, ctx) => moveKeyDeliverable(input, ctx.session.userId),
});

/** New dates from a dragged or stretched bar, or a date typed in the outline. */
export const rescheduleWbsItemAction = action({
  name: "key-deliverables.wbs-reschedule",
  schema: rescheduleWbsItemInput,
  permission: "key-deliverables:update",
  handler: (input, ctx) => rescheduleKeyDeliverable(input, ctx.session.userId),
});

export const renameWbsItemAction = action({
  name: "key-deliverables.wbs-rename",
  schema: renameWbsItemInput,
  permission: "key-deliverables:update",
  handler: (input, ctx) => renameKeyDeliverable(input, ctx.session.userId),
});

/** Delete an item and its whole branch. */
export const deleteWbsItemAction = action({
  name: "key-deliverables.wbs-delete",
  schema: deleteWbsItemInput,
  permission: "key-deliverables:delete",
  handler: (input, ctx) => deleteWbsItem(input, ctx.session.userId),
});

/** Set an item's status from the menu (ADR-0036). */
export const setWbsStatusAction = action({
  name: "key-deliverables.wbs-status",
  schema: setWbsStatusInput,
  permission: "key-deliverables:update",
  handler: (input, ctx) => setWbsItemStatus(input, ctx.session.userId),
});

/*
 * The requirements cascade (ADR-0037): create, edit, move within a deliverable, or take a
 * requirement off one deliverable, from the WBS or Gantt. Permissions follow requirements:*, so a
 * Contributor can work on requirements without being able to change deliverables. Each answers
 * with the whole breakdown; the page is dynamic, so no path is revalidated.
 */

export const addRequirementAction = action({
  name: "key-deliverables.requirement-add",
  schema: addRequirementInput,
  permission: "requirements:create",
  handler: (input, ctx) => addCascadeRequirement(input, ctx.session.userId),
});

export const updateRequirementAction = action({
  name: "key-deliverables.requirement-update",
  schema: updateRequirementInput,
  permission: "requirements:update",
  handler: (input, ctx) => updateCascadeRequirement(input, ctx.session.userId),
});

export const moveRequirementAction = action({
  name: "key-deliverables.requirement-move",
  schema: moveRequirementInput,
  permission: "requirements:update",
  handler: (input, ctx) => moveCascadeRequirement(input, ctx.session.userId),
});

export const removeRequirementAction = action({
  name: "key-deliverables.requirement-remove",
  schema: removeRequirementInput,
  permission: "requirements:update",
  handler: (input, ctx) => removeCascadeRequirement(input, ctx.session.userId),
});
