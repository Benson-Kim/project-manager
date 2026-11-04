"use server";

import { action } from "@/lib/action";
import { createDecision, deleteDecision, updateDecision } from "../repository/decisions";
import { createDecisionFormSchema, updateDecisionFormSchema } from "../schemas/decision-form";
import { deleteDecisionInput } from "../schemas/decision";

/**
 * Log a decision (RBAC decisions:create — project level checked in-proc,
 * ADR-0021; audited in-proc). See rbac.ts CONTRIBUTOR_WRITE_MODULES.
 */
export const createDecisionAction = action({
  name: "decisions.create",
  schema: createDecisionFormSchema,
  permission: "decisions:create",
  handler: (input, ctx) => createDecision(input, ctx.session.userId),
});

/** Update a decision (RBAC decisions:update — project level checked in-proc). */
export const updateDecisionAction = action({
  name: "decisions.update",
  schema: updateDecisionFormSchema,
  permission: "decisions:update",
  handler: (input, ctx) => updateDecision(input, ctx.session.userId),
});

/** Soft-delete a decision (RBAC decisions:delete — Manager, checked in-proc). */
export const deleteDecisionAction = action({
  name: "decisions.delete",
  schema: deleteDecisionInput,
  permission: "decisions:delete",
  handler: async (input, ctx) => {
    await deleteDecision(input.decisionId, input.rowVer, ctx.session.userId);
    return { decisionId: input.decisionId };
  },
});
