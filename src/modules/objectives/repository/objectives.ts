import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createObjectiveInput,
  objectiveListRowSchema,
  objectiveRowSchema,
  updateObjectiveInput,
  type CreateObjectiveInput,
  type CreateObjectiveParsed,
  type ObjectiveListRow,
  type ObjectiveRow,
  type UpdateObjectiveInput,
} from "../schemas/objective";

/**
 * Objective repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 */

function toProcParams(input: CreateObjectiveParsed) {
  return {
    ProjectId: input.projectId,
    QMeasurable: input.qMeasurable ?? null,
    QSuccess: input.qSuccess ?? null,
    QAlignmentStrategy: input.qAlignmentStrategy ?? null,
    ObjectiveText: input.objectiveText ?? null,
  };
}

export async function createObjective(
  input: CreateObjectiveInput,
  actorUserId: number,
): Promise<ObjectiveRow> {
  const parsed = createObjectiveInput.parse(input);
  const rows = await execProc<ObjectiveRow>("usp_Objective_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return objectiveRowSchema.parse(rows[0]);
}

export async function getObjectiveById(
  objectiveId: number,
  actorUserId: number,
  actorRole: string,
): Promise<ObjectiveRow> {
  const rows = await execProc<ObjectiveRow>("usp_Objective_GetById", {
    ObjectiveId: objectiveId,
    ActorUserId: actorUserId,
    ActorRole: actorRole,
  });
  return objectiveRowSchema.parse(rows[0]);
}

export async function listObjectives(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  actorRole?: string,
): Promise<ObjectiveListRow[]> {
  const rows = await execProc<ObjectiveListRow>("usp_Objective_List", {
    ActorUserId: actorUserId,
    ActorRole: actorRole ?? null,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => objectiveListRowSchema.parse(r));
}

export async function updateObjective(
  input: UpdateObjectiveInput,
  actorUserId: number,
): Promise<ObjectiveRow> {
  const parsed = updateObjectiveInput.parse(input);
  const rows = await execProc<ObjectiveRow>("usp_Objective_Update", {
    ObjectiveId: parsed.objectiveId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return objectiveRowSchema.parse(rows[0]);
}

export async function deleteObjective(
  objectiveId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Objective_Delete", {
    ObjectiveId: objectiveId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
