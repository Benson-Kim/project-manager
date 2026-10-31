import { z } from "zod";
import type { ListSort } from "@/lib/list-params";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * RiskIssue — zod contracts (module #14, ADR-0050). The row schema mirrors the
 * SELECT shape of usp_RiskIssue_{Create,GetById,List,Update}.
 *
 * Category, Status, Priority, Impact and Probability are managed lists
 * (ADR-0022, migration 049); the row schema accepts any string from the DB so a
 * record keeps a value whose option was later retired.
 */

export const RISK_ISSUE_LISTS = [
  "risk-issue.category",
  "risk-issue.status",
  "risk-issue.priority",
  "risk-issue.impact",
  "risk-issue.probability",
] as const satisfies readonly LookupListKey[];

/**
 * The labels the code reads by name, so migration 049 locks them: a new record
 * starts as an open Risk, and a Closed record is shown muted the way a Resolved
 * parking lot item is struck through.
 */
export const RISK_ISSUE_CATEGORY = { risk: "Risk", issue: "Issue" } as const;
export const RISK_ISSUE_STATUS = { open: "Open", closed: "Closed" } as const;

/** Whether a record is closed, i.e. no longer live work. */
export function isClosed(status: string | null | undefined): boolean {
  return status === RISK_ISSUE_STATUS.closed;
}

export const riskIssueRowSchema = z.object({
  RiskIssueId: z.number().int(),
  ProjectId: z.number().int(),
  Description: z.string().nullable(),
  Category: z.string().nullable(),
  DateIdentified: z.date().nullable(),
  Status: z.string().nullable(),
  Priority: z.string().nullable(),
  Impact: z.string().nullable(),
  Probability: z.string().nullable(),
  MitigationPlan: z.string().nullable(),
  Owner: z.string().nullable(),
  DueDate: z.date().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type RiskIssueRow = z.infer<typeof riskIssueRowSchema>;

export const riskIssueListRowSchema = riskIssueRowSchema.extend({
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type RiskIssueListRow = z.infer<typeof riskIssueListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createRiskIssueInput = z.object({
  projectId: z.number().int().positive(),
  description: z.string().trim().min(1),
  category: listValue.nullish(),
  dateIdentified: z.coerce.date().nullish(),
  status: listValue.nullish(),
  priority: listValue.nullish(),
  impact: listValue.nullish(),
  probability: listValue.nullish(),
  mitigationPlan: z.string().trim().nullish(),
  owner: z.string().trim().max(255).nullish(),
  dueDate: z.coerce.date().nullish(),
});

export type CreateRiskIssueInput = z.input<typeof createRiskIssueInput>;
export type CreateRiskIssueParsed = z.infer<typeof createRiskIssueInput>;

export const updateRiskIssueInput = createRiskIssueInput.extend({
  riskIssueId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateRiskIssueInput = z.input<typeof updateRiskIssueInput>;

export const deleteRiskIssueInput = z.object({
  riskIssueId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteRiskIssueInput = z.input<typeof deleteRiskIssueInput>;

/**
 * The orders usp_RiskIssue_List applies (ADR-0016). Null default: the proc
 * falls back to RiskIssueId, which is the order they were raised in — the same
 * choice the assumptions & constraints register makes, and it avoids SQL
 * Server sorting the undated records to the top of a date order.
 */
export const RISK_ISSUE_SORT: ListSort = {
  columns: ["Category", "DateIdentified", "Status", "Priority", "DueDate"],
  default: null,
};
