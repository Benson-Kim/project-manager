import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createKeyDeliverableInput,
  keyDeliverableListRowSchema,
  keyDeliverableRowSchema,
  updateKeyDeliverableInput,
  wbsRowSchema,
  wbsWindowSchema,
  type CreateKeyDeliverableInput,
  type CreateKeyDeliverableParsed,
  type KeyDeliverableFilters,
  type KeyDeliverableListRow,
  type KeyDeliverableRow,
  type UpdateKeyDeliverableInput,
  type UpdateKeyDeliverableParsed,
  type WbsData,
} from "../schemas/key-deliverable";

/**
 * KeyDeliverable repository — stored procedures only, every row
 * zod-parsed at the boundary (STANDARDS §2.5), list params forwarded 1:1.
 */

function fieldParams(input: CreateKeyDeliverableParsed | UpdateKeyDeliverableParsed) {
  return {
    ProjectId: input.projectId,
    KeyRequirement: input.keyRequirement,
    RequestedDate: input.requestedDate ?? null,
    StartDate: input.startDate ?? null,
    Deadline: input.deadline ?? null,
    AssigneeIds:
      input.assigneeIds && input.assigneeIds.length > 0 ? JSON.stringify(input.assigneeIds) : null,
    Priority: input.priority ?? null,
    Status: input.status ?? null,
  };
}

export async function createKeyDeliverable(
  input: CreateKeyDeliverableInput,
  actorUserId: number,
): Promise<KeyDeliverableRow> {
  const parsed = createKeyDeliverableInput.parse(input);
  const rows = await execProc<KeyDeliverableRow>("usp_KeyDeliverable_Create", {
    ...fieldParams(parsed),
    Color: parsed.color ?? null,
    ParentKeyDeliverableId: parsed.parentId ?? null,
    AfterKeyDeliverableId: parsed.afterId ?? null,
    ActorUserId: actorUserId,
  });
  return keyDeliverableRowSchema.parse(rows[0]);
}

export async function getKeyDeliverableById(
  keyDeliverableId: number,
  actorUserId: number,
): Promise<KeyDeliverableRow> {
  const rows = await execProc<KeyDeliverableRow>("usp_KeyDeliverable_GetById", {
    KeyDeliverableId: keyDeliverableId,
    ActorUserId: actorUserId,
  });
  return keyDeliverableRowSchema.parse(rows[0]);
}

export async function listKeyDeliverables(
  projectId: number,
  params: ListParams,
  actorUserId: number,
  filters: KeyDeliverableFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<KeyDeliverableListRow[]> {
  const rows = await execProc<KeyDeliverableListRow>("usp_KeyDeliverable_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Status: filters.status ?? null,
    Priority: filters.priority ?? null,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => keyDeliverableListRowSchema.parse(r));
}

export async function updateKeyDeliverable(
  input: UpdateKeyDeliverableInput,
  actorUserId: number,
): Promise<KeyDeliverableRow> {
  const parsed = updateKeyDeliverableInput.parse(input);
  const rows = await execProc<KeyDeliverableRow>("usp_KeyDeliverable_Update", {
    KeyDeliverableId: parsed.keyDeliverableId,
    ...fieldParams(parsed),
    Color: parsed.color ?? null,
    ColorSet: parsed.color === undefined ? 0 : 1,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return keyDeliverableRowSchema.parse(rows[0]);
}

export async function deleteKeyDeliverable(
  keyDeliverableId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_KeyDeliverable_Delete", {
    KeyDeliverableId: keyDeliverableId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/** The project's work breakdown (usp_KeyDeliverable_GanttData, ADR-0027). */
export async function getWbs(projectId: number, actorUserId: number): Promise<WbsData> {
  const rows = await execProc<Record<string, unknown>>("usp_KeyDeliverable_GanttData", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
    WithProjectRow: 1,
  });
  const project = rows[0] ? wbsWindowSchema.parse(rows[0]) : null;
  return {
    items: rows.filter((r) => r.KeyDeliverableId != null).map((r) => wbsRowSchema.parse(r)),
    projectStart: project?.ProjectStartDate ?? null,
    projectEnd: project?.ProjectEndDate ?? null,
    stamp: project?.Stamp ?? 0,
  };
}

/**
 * Work breakdown edits return the project's whole breakdown afterwards, read
 * for the project the proc reports (never one the caller names), so the
 * editor shows every renumbered sibling and rolled-up parent at once.
 */
async function wbsAfter(
  proc: string,
  params: Record<string, unknown>,
  actorUserId: number,
): Promise<WbsData> {
  const rows = await execProc<{ ProjectId: number }>(proc, { ...params, ActorUserId: actorUserId });
  const projectId = rows[0]?.ProjectId;
  if (typeof projectId !== "number") throw new Error(`${proc} returned no ProjectId`);
  return getWbs(projectId, actorUserId);
}

export function moveKeyDeliverable(
  input: { id: number; parentId: number | null; position: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_Move",
    {
      KeyDeliverableId: input.id,
      ParentKeyDeliverableId: input.parentId,
      Position: input.position,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

export function rescheduleKeyDeliverable(
  input: { id: number; start: Date; end: Date; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_Reschedule",
    {
      KeyDeliverableId: input.id,
      StartDate: input.start,
      Deadline: input.end,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

export function renameKeyDeliverable(
  input: { id: number; name: string; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_Rename",
    { KeyDeliverableId: input.id, KeyRequirement: input.name, RowVer: input.rowVer },
    actorUserId,
  );
}

/** Delete an item and its whole branch. */
export function deleteWbsItem(
  input: { id: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_Delete",
    { KeyDeliverableId: input.id, RowVer: input.rowVer },
    actorUserId,
  );
}

/** Change only an item's status, which also sets its colour (ADR-0034). */
export function setWbsItemStatus(
  input: { id: number; status: string | null; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_SetStatus",
    { KeyDeliverableId: input.id, Status: input.status, RowVer: input.rowVer },
    actorUserId,
  );
}

/*
 * An item's requirements (migration 035, ADR-0034). Like the breakdown edits,
 * each answers with the project's whole breakdown, which carries them.
 */

/** Add a requirement last under an item; answers with its id too. */
export async function addRequirement(
  input: { itemId: number; text: string },
  actorUserId: number,
): Promise<WbsData & { id: number }> {
  const rows = await execProc<{ KeyDeliverableRequirementId: number; ProjectId: number }>(
    "usp_KeyDeliverableRequirement_Create",
    { KeyDeliverableId: input.itemId, Requirement: input.text, ActorUserId: actorUserId },
  );
  const row = rows[0];
  if (typeof row?.ProjectId !== "number" || typeof row.KeyDeliverableRequirementId !== "number") {
    throw new Error("usp_KeyDeliverableRequirement_Create returned no row");
  }
  const wbs = await getWbs(row.ProjectId, actorUserId);
  return { id: row.KeyDeliverableRequirementId, ...wbs };
}

export function updateRequirement(
  input: { id: number; text: string; isMet: boolean; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableRequirement_Update",
    {
      KeyDeliverableRequirementId: input.id,
      Requirement: input.text,
      IsMet: input.isMet,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

export function moveRequirement(
  input: { id: number; position: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableRequirement_Move",
    { KeyDeliverableRequirementId: input.id, Position: input.position, RowVer: input.rowVer },
    actorUserId,
  );
}

export function deleteRequirement(
  input: { id: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableRequirement_Delete",
    { KeyDeliverableRequirementId: input.id, RowVer: input.rowVer },
    actorUserId,
  );
}
