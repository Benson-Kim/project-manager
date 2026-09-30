"use server";

import { action } from "@/lib/action";
import { createObjective, deleteObjective, updateObjective } from "../repository/objectives";
import { objectiveFormSchema, updateObjectiveFormSchema } from "../schemas/objective-form";
import { deleteObjectiveInput } from "../schemas/objective";

/**
 * Create an objective (RBAC objectives:create — Admin + PM; audited in-proc).
 * The objectives page is dynamic (session cookie) and the sheet calls
 * router.refresh() on success — no static path to revalidate (ADR-0018
 * project-scoped route).
 */
export const createObjectiveAction = action({
  name: "objectives.create",
  schema: objectiveFormSchema,
  permission: "objectives:create",
  handler: (input, ctx) => createObjective(input, ctx.session.userId),
});

/** Update an objective (RBAC objectives:update — Admin + PM; audited in-proc). */
export const updateObjectiveAction = action({
  name: "objectives.update",
  schema: updateObjectiveFormSchema,
  permission: "objectives:update",
  handler: (input, ctx) => updateObjective(input, ctx.session.userId),
});

/** Soft-delete an objective (RBAC objectives:delete — Admin + PM; audited in-proc). */
export const deleteObjectiveAction = action({
  name: "objectives.delete",
  schema: deleteObjectiveInput,
  permission: "objectives:delete",
  handler: async (input, ctx) => {
    await deleteObjective(input.objectiveId, input.rowVer, ctx.session.userId);
    return { objectiveId: input.objectiveId };
  },
});
