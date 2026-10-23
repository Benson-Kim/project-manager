"use server";

import { action } from "@/lib/action";
import {
  createRequirement,
  deleteRequirement,
  updateRequirement,
} from "../repository/requirements";
import {
  createRequirementFormSchema,
  updateRequirementFormSchema,
} from "../schemas/requirement-form";
import { deleteRequirementInput } from "../schemas/requirement";

/**
 * Requirement register mutations (ADR-0037). Project level is checked in-proc (ADR-0021); the
 * procs write the audit row in-transaction. A change shows in the register and in the WBS/Gantt
 * cascade, so every one revalidates all three routes.
 */
const REVALIDATE_TARGETS = [
  "/projects/[id]/requirements",
  "/projects/[id]/deliverables",
  "/projects/[id]/deliverables/gantt",
];

export const createRequirementAction = action({
  name: "requirements.create",
  schema: createRequirementFormSchema,
  permission: "requirements:create",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createRequirement(input, ctx.session.userId),
});

export const updateRequirementAction = action({
  name: "requirements.update",
  schema: updateRequirementFormSchema,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => updateRequirement(input, ctx.session.userId),
});

export const deleteRequirementAction = action({
  name: "requirements.delete",
  schema: deleteRequirementInput,
  permission: "requirements:delete",
  revalidate: REVALIDATE_TARGETS,
  handler: async (input, ctx) => {
    await deleteRequirement(input.requirementId, input.rowVer, ctx.session.userId);
    return { requirementId: input.requirementId };
  },
});
