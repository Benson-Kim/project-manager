import { execProc, type ProcParams } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import type { CreateRequirementValues, UpdateRequirementValues } from "../schemas/requirement-form";
import type { SetMoscowInput, SetPlanningInput } from "../schemas/requirement-planning";
import {
  requirementListRowSchema,
  requirementOptionSchema,
  requirementRowSchema,
  type DeleteImpactRow,
  deleteImpactRowSchema,
  type DeleteRequirementInput,
  type RequirementListRow,
  type RequirementOption,
  type RequirementRow,
} from "../schemas/requirement";
import { linkRuleRowSchema, type LinkRule, type SetLinkRuleInput } from "../schemas/link-rules";
import {
  requirementLinkRowSchema,
  type CreateRequirementLinkInput,
  type DeleteRequirementLinkInput,
  type RequirementLink,
  type UpdateRequirementLinkInput,
} from "../schemas/requirement-link";
import { isNeed } from "../schemas/requirement-types";

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
  /** Rows holding one choice of an added column (ADR-0067), by ids. */
  choice: { columnId: number; optionId: number } | null = null,
): Promise<RequirementListRow[]> {
  const rows = await execProc<RequirementListRow>("usp_Requirement_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Type: type,
    ...toProcListParams(params, pageSize),
    CustomColumnId: choice?.columnId ?? null,
    CustomOptionId: choice?.optionId ?? null,
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

/** The needs and solutions a link can point at: a solution links to needs, a test to solutions. */
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

/** The allowed link pairs, app-wide (ADR-0060). The write procs have the last word. */
export async function listLinkRules(actorUserId: number): Promise<LinkRule[]> {
  const rows = await execProc("usp_RequirementLinkRule_List", { ActorUserId: actorUserId });
  return rows.map((r) => linkRuleRowSchema.parse(r));
}

/** Ticks or clears one link rule. The proc refuses anyone but an Admin. */
export async function setLinkRule(input: SetLinkRuleInput, actorUserId: number): Promise<void> {
  await execProc("usp_RequirementLinkRule_Set", {
    DownstreamType: input.downstreamType,
    UpstreamType: input.upstreamType,
    Allowed: input.allowed,
    ActorUserId: actorUserId,
  });
}

/** Every link of one requirement with its record, for the sheet (ADR-0060). */
export async function listRequirementLinks(
  requirementId: number,
  actorUserId: number,
): Promise<RequirementLink[]> {
  const rows = await execProc("usp_RequirementLink_List", {
    RequirementId: requirementId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => requirementLinkRowSchema.parse(r));
}

export async function execForProjectId(proc: string, params: ProcParams): Promise<number> {
  const rows = await execProc<{ ProjectId: number }>(proc, params);
  const projectId = rows[0]?.ProjectId;
  if (typeof projectId !== "number") throw new Error(`${proc} returned no ProjectId`);
  return projectId;
}

export function createRequirementLink(
  input: CreateRequirementLinkInput,
  actorUserId: number,
): Promise<number> {
  return execForProjectId("usp_RequirementLink_Create", {
    RequirementId: input.requirementId,
    UpstreamRequirementId: input.upstreamRequirementId,
    Rationale: input.rationale,
    LinkStatus: input.linkStatus,
    ActorUserId: actorUserId,
  });
}

export function updateRequirementLink(
  input: UpdateRequirementLinkInput,
  actorUserId: number,
): Promise<number> {
  return execForProjectId("usp_RequirementLink_Update", {
    RequirementId: input.requirementId,
    UpstreamRequirementId: input.upstreamRequirementId,
    KeyDeliverableId: input.keyDeliverableId,
    Rationale: input.rationale,
    LinkStatus: input.linkStatus,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export function deleteRequirementLink(
  input: DeleteRequirementLinkInput,
  actorUserId: number,
): Promise<number> {
  return execForProjectId("usp_RequirementLink_Delete", {
    RequirementId: input.requirementId,
    UpstreamRequirementId: input.upstreamRequirementId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

/** The needs alone, for the WBS and Gantt cascade, which only creates solutions. */
export async function listNeedOptions(
  projectId: number,
  actorUserId: number,
): Promise<RequirementOption[]> {
  return (await listRequirementOptions(projectId, actorUserId)).filter((o) => isNeed(o.type));
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
    ParentRequirementId: input.parentRequirementId,
    ValidatesIds: jsonIds(input.validatesIds),
    KeyDeliverableIds: jsonIds(input.deliverableIds),
    MoSCoW: input.moscow,
    AcceptanceCriteria: input.acceptanceCriteria,
    EstimateDays: input.estimateDays,
    OwnerStakeholderId: input.ownerStakeholderId,
    ActorUserId: actorUserId,
  });
  return requirementRowSchema.parse(rows[0]);
}

/** One MoSCoW chip (ADR-0052); answers with the row and its new RowVer. */
export async function setRequirementMoscow(
  input: SetMoscowInput,
  actorUserId: number,
): Promise<RequirementRow> {
  const rows = await execProc<RequirementRow>("usp_Requirement_SetMoSCoW", {
    RequirementId: input.requirementId,
    MoSCoW: input.moscow,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return requirementRowSchema.parse(rows[0]);
}

/** Criteria, estimate and owner together (ADR-0052); answers with the row. */
export async function setRequirementPlanning(
  input: SetPlanningInput,
  actorUserId: number,
): Promise<RequirementRow> {
  const rows = await execProc<RequirementRow>("usp_Requirement_SetPlanning", {
    RequirementId: input.requirementId,
    AcceptanceCriteria: input.acceptanceCriteria,
    EstimateDays: input.estimateDays,
    OwnerStakeholderId: input.ownerStakeholderId,
    RowVer: input.rowVer,
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
  input: DeleteRequirementInput,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Requirement_Delete", {
    RequirementId: input.requirementId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
    ChildAction: input.childAction,
    ExpectedDeleteIds: input.expectedDeleteIds ? JSON.stringify(input.expectedDeleteIds) : null,
  });
}

export async function readRequirementDeleteImpact(
  requirementId: number,
  actorUserId: number,
): Promise<DeleteImpactRow[]> {
  const rows = await execProc("usp_Requirement_DeleteImpact", {
    RequirementId: requirementId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => deleteImpactRowSchema.parse(r));
}
