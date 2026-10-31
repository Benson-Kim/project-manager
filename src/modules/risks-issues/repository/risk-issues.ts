import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createRiskIssueInput,
  riskIssueListRowSchema,
  riskIssueRowSchema,
  updateRiskIssueInput,
  type CreateRiskIssueInput,
  type CreateRiskIssueParsed,
  type RiskIssueListRow,
  type RiskIssueRow,
  type UpdateRiskIssueInput,
} from "../schemas/risk-issue";

/**
 * RiskIssue repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 * Procs resolve the actor's project access from @ActorUserId (ADR-0021).
 */

export interface RiskIssueListFilters {
  category?: string | null;
  status?: string | null;
}

function toProcParams(input: CreateRiskIssueParsed) {
  return {
    Description: input.description,
    Category: input.category ?? null,
    DateIdentified: input.dateIdentified ?? null,
    Status: input.status ?? null,
    Priority: input.priority ?? null,
    Impact: input.impact ?? null,
    Probability: input.probability ?? null,
    MitigationPlan: input.mitigationPlan ?? null,
    Owner: input.owner ?? null,
    DueDate: input.dueDate ?? null,
  };
}

export async function createRiskIssue(
  input: CreateRiskIssueInput,
  actorUserId: number,
): Promise<RiskIssueRow> {
  const parsed = createRiskIssueInput.parse(input);
  const rows = await execProc<RiskIssueRow>("usp_RiskIssue_Create", {
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) {
    const { AppError: AE } = await import("@/lib/errors");
    throw new AE("INTERNAL", "Create returned no rows");
  }
  return riskIssueRowSchema.parse(rows[0]);
}

export async function getRiskIssueById(
  riskIssueId: number,
  actorUserId: number,
): Promise<RiskIssueRow> {
  const rows = await execProc<RiskIssueRow>("usp_RiskIssue_GetById", {
    RiskIssueId: riskIssueId,
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) {
    const { AppError: AE } = await import("@/lib/errors");
    throw new AE("NOT_FOUND", "RiskIssue not found");
  }
  return riskIssueRowSchema.parse(rows[0]);
}

export async function listRiskIssues(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  filters: RiskIssueListFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<RiskIssueListRow[]> {
  const rows = await execProc<RiskIssueListRow>("usp_RiskIssue_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    Category: filters.category ?? null,
    Status: filters.status ?? null,
  });
  return rows.map((r) => riskIssueListRowSchema.parse(r));
}

export async function updateRiskIssue(
  input: UpdateRiskIssueInput,
  actorUserId: number,
): Promise<RiskIssueRow> {
  const parsed = updateRiskIssueInput.parse(input);
  const rows = await execProc<RiskIssueRow>("usp_RiskIssue_Update", {
    RiskIssueId: parsed.riskIssueId,
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  if (rows.length === 0) {
    const { AppError: AE } = await import("@/lib/errors");
    throw new AE("INTERNAL", "Update returned no rows");
  }
  return riskIssueRowSchema.parse(rows[0]);
}

export async function deleteRiskIssue(
  riskIssueId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_RiskIssue_Delete", {
    RiskIssueId: riskIssueId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
