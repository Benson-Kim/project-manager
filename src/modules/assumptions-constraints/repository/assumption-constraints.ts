import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import type { Role } from "@/lib/auth/types";
import {
  assumptionConstraintListRowSchema,
  assumptionConstraintRowSchema,
  createAssumptionConstraintInput,
  updateAssumptionConstraintInput,
  type AssumptionConstraintListRow,
  type AssumptionConstraintRow,
  type CreateAssumptionConstraintInput,
  type CreateAssumptionConstraintParsed,
  type UpdateAssumptionConstraintInput,
} from "../schemas/assumption-constraint";

/**
 * AssumptionConstraint repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 * actorRole is forwarded to mutation procs for the ProjectAssignee check
 * (Admin bypass); matches the Q&A repository pattern.
 */

export interface AssumptionConstraintListFilters {
  type?: string | null;
}

function toProcParams(input: CreateAssumptionConstraintParsed) {
  return {
    Type: input.type ?? null,
    Description: input.description,
    IsValidated: input.isValidated,
    Impact: input.impact ?? null,
    MitigationPlan: input.mitigationPlan ?? null,
  };
}

export async function createAssumptionConstraint(
  input: CreateAssumptionConstraintInput,
  actorUserId: number,
  actorRole: Role,
): Promise<AssumptionConstraintRow> {
  const parsed = createAssumptionConstraintInput.parse(input);
  const rows = await execProc<AssumptionConstraintRow>(
    "usp_AssumptionConstraint_Create",
    {
      ProjectId: parsed.projectId,
      ...toProcParams(parsed),
      ActorUserId: actorUserId,
      ActorRole: actorRole,
    },
  );
  return assumptionConstraintRowSchema.parse(rows[0]);
}

export async function getAssumptionConstraintById(
  assumptionConstraintId: number,
  actorUserId: number,
): Promise<AssumptionConstraintRow> {
  const rows = await execProc<AssumptionConstraintRow>(
    "usp_AssumptionConstraint_GetById",
    {
      AssumptionConstraintId: assumptionConstraintId,
      ActorUserId: actorUserId,
    },
  );
  return assumptionConstraintRowSchema.parse(rows[0]);
}

export async function listAssumptionConstraints(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  filters: AssumptionConstraintListFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<AssumptionConstraintListRow[]> {
  const rows = await execProc<AssumptionConstraintListRow>(
    "usp_AssumptionConstraint_List",
    {
      ActorUserId: actorUserId,
      ProjectId: projectId,
      ...toProcListParams(params, pageSize),
      Type: filters.type ?? null,
    },
  );
  return rows.map((r) => assumptionConstraintListRowSchema.parse(r));
}

export async function updateAssumptionConstraint(
  input: UpdateAssumptionConstraintInput,
  actorUserId: number,
  actorRole: Role,
): Promise<AssumptionConstraintRow> {
  const parsed = updateAssumptionConstraintInput.parse(input);
  const rows = await execProc<AssumptionConstraintRow>(
    "usp_AssumptionConstraint_Update",
    {
      AssumptionConstraintId: parsed.assumptionConstraintId,
      ProjectId: parsed.projectId,
      ...toProcParams(parsed),
      RowVer: parsed.rowVer,
      ActorUserId: actorUserId,
      ActorRole: actorRole,
    },
  );
  return assumptionConstraintRowSchema.parse(rows[0]);
}

export async function deleteAssumptionConstraint(
  assumptionConstraintId: number,
  rowVer: number,
  actorUserId: number,
  actorRole: Role,
): Promise<void> {
  await execProc("usp_AssumptionConstraint_Delete", {
    AssumptionConstraintId: assumptionConstraintId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
}
