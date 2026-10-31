"use server";

import { action } from "@/lib/action";
import { createRiskIssue, deleteRiskIssue, updateRiskIssue } from "../repository/risk-issues";
import { riskIssueFormSchema, updateRiskIssueFormSchema } from "../schemas/risk-issue-form";
import { deleteRiskIssueInput } from "../schemas/risk-issue";

/**
 * Raise a risk or issue (RBAC risks-issues:create — project level checked
 * in-proc, ADR-0021; audited in-proc). See rbac.ts CONTRIBUTOR_WRITE_MODULES.
 */
export const createRiskIssueAction = action({
  name: "risks-issues.create",
  schema: riskIssueFormSchema,
  permission: "risks-issues:create",
  handler: (input, ctx) => createRiskIssue(input, ctx.session.userId),
});

/**
 * Update a risk or issue (RBAC risks-issues:update — project level checked
 * in-proc, ADR-0021; audited in-proc).
 */
export const updateRiskIssueAction = action({
  name: "risks-issues.update",
  schema: updateRiskIssueFormSchema,
  permission: "risks-issues:update",
  handler: (input, ctx) => updateRiskIssue(input, ctx.session.userId),
});

/**
 * Soft-delete a risk or issue (RBAC risks-issues:delete — project level checked
 * in-proc, ADR-0021; audited in-proc).
 */
export const deleteRiskIssueAction = action({
  name: "risks-issues.delete",
  schema: deleteRiskIssueInput,
  permission: "risks-issues:delete",
  handler: async (input, ctx) => {
    await deleteRiskIssue(input.riskIssueId, input.rowVer, ctx.session.userId);
    return { riskIssueId: input.riskIssueId };
  },
});
