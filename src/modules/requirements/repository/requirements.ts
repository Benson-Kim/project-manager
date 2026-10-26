import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import type { CreateRequirementValues, UpdateRequirementValues } from "../schemas/requirement-form";
import {
  requirementListRowSchema,
  requirementOptionSchema,
  requirementRowSchema,
  type RequirementListRow,
  type RequirementOption,
  type RequirementRow,
} from "../schemas/requirement";

/**
 * Requirement repository (ADR-0037) — stored procedures only, every row zod-parsed at the
 * boundary (STANDARDS §2.5). Each function takes already-parsed input (LESSONS §30) and never
 * re-parses. Id lists cross as JSON arrays of positive integers, or NULL to leave that side alone.
 */

/** A set flag: the list is replaced only when it was sent (@ColorSet pattern). */
const jsonIds = (ids: readonly number[] | null) => (ids === null ? null : JSON.stringify(ids));

export async function listRequirements(
  params: ListParams,
  actorUserId: number,
  projectId: number,
  type: string | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<RequirementListRow[]> {
  const rows = await execProc<RequirementListRow>("usp_Requirement_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Type: type,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => requirementListRowSchema.parse(r));
}

/**
 * Every requirement of one project, for the CSV and PDF exports. The list proc
 * caps a page at 100 (ADR-0016), so this walks pages rather than asking for
 * one huge one, and stops at EXPORT_MAX so a runaway project cannot pull an
 * unbounded result into memory. The cost is the project's own register, not
 * the tenant's.
 */
export const EXPORT_MAX = 5000;
const EXPORT_PAGE = 100;

export async function listRequirementsForExport(
  actorUserId: number,
  projectId: number,
  type: string | null = null,
): Promise<RequirementListRow[]> {
  const all: RequirementListRow[] = [];
  for (let page = 1; all.length < EXPORT_MAX; page += 1) {
    const rows = await listRequirements(
      { page, dir: "asc", q: undefined },
      actorUserId,
      projectId,
      type,
      EXPORT_PAGE,
    );
    all.push(...rows);
    if (rows.length < EXPORT_PAGE) break;
  }
  return all.slice(0, EXPORT_MAX);
}

export async function getRequirementById(
  requirementId: number,
  actorUserId: number,
): Promise<RequirementRow> {
  const rows = await execProc<RequirementRow>("usp_Requirement_GetById", {
    RequirementId: requirementId,
    ActorUserId: actorUserId,
  });
  return requirementRowSchema.parse(rows[0]);
}

export async function listRequirementOptions(
  projectId: number,
  actorUserId: number,
): Promise<RequirementOption[]> {
  const rows = await execProc<RequirementOption>("usp_Requirement_ListOptions", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => requirementOptionSchema.parse(r));
}

export async function createRequirement(
  input: CreateRequirementValues,
  actorUserId: number,
): Promise<RequirementRow> {
  const rows = await execProc<RequirementRow>("usp_Requirement_Create", {
    ProjectId: input.projectId,
    RequirementType: input.type,
    Requirement: input.text,
    IsMet: input.isMet,
    ValidatesIds: jsonIds(input.validatesIds),
    KeyDeliverableIds: jsonIds(input.deliverableIds),
    ActorUserId: actorUserId,
  });
  return requirementRowSchema.parse(rows[0]);
}

export async function updateRequirement(
  input: UpdateRequirementValues,
  actorUserId: number,
): Promise<RequirementRow> {
  const rows = await execProc<RequirementRow>("usp_Requirement_Update", {
    RequirementId: input.requirementId,
    RequirementType: input.type,
    Requirement: input.text,
    IsMet: input.isMet,
    ValidatesSet: input.validatesIds === null ? 0 : 1,
    ValidatesIds: jsonIds(input.validatesIds),
    DeliverablesSet: input.deliverableIds === null ? 0 : 1,
    KeyDeliverableIds: jsonIds(input.deliverableIds),
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return requirementRowSchema.parse(rows[0]);
}

/** Move one allocation under its deliverable; answers with the project id for a WBS read-back. */
export async function moveRequirement(
  input: { requirementId: number; keyDeliverableId: number; position: number; rowVer: number },
  actorUserId: number,
): Promise<number> {
  const rows = await execProc<{ ProjectId: number }>("usp_Requirement_Move", {
    RequirementId: input.requirementId,
    KeyDeliverableId: input.keyDeliverableId,
    Position: input.position,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  const projectId = rows[0]?.ProjectId;
  if (typeof projectId !== "number") throw new Error("usp_Requirement_Move returned no ProjectId");
  return projectId;
}

/** Remove one allocation (the cascade's x); answers with the project id for a WBS read-back. */
export async function unallocateRequirement(
  input: { requirementId: number; keyDeliverableId: number; rowVer: number },
  actorUserId: number,
): Promise<number> {
  const rows = await execProc<{ ProjectId: number }>("usp_Requirement_Unallocate", {
    RequirementId: input.requirementId,
    KeyDeliverableId: input.keyDeliverableId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  const projectId = rows[0]?.ProjectId;
  if (typeof projectId !== "number")
    throw new Error("usp_Requirement_Unallocate returned no ProjectId");
  return projectId;
}

export async function deleteRequirement(
  requirementId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Requirement_Delete", {
    RequirementId: requirementId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
