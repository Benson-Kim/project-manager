import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createRequirement as createRequirementRow,
  moveRequirement as moveRequirementAllocation,
  unallocateRequirement,
  updateRequirement as updateRequirementRow,
} from "@/modules/requirements/repository/requirements";
import type { RequirementType } from "@/modules/requirements/schemas/requirement-types";
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

/** Change only an item's status (ADR-0036). */
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
 * The WBS/Gantt requirements cascade (ADR-0037). A requirement is a project-level record owned by
 * the requirements module; these go through that module's write procs, then answer with the whole
 * breakdown so the editor replaces its guess. They never touch trace links or other allocations.
 */

/** Create a requirement already allocated to one deliverable; answers with its id too. */
export async function addCascadeRequirement(
  input: { projectId: number; itemId: number; type: RequirementType; text: string },
  actorUserId: number,
): Promise<WbsData & { id: number }> {
  const row = await createRequirementRow(
    {
      projectId: input.projectId,
      type: input.type,
      text: input.text,
      isMet: false,
      validatesIds: null,
      deliverableIds: [input.itemId],
    },
    actorUserId,
  );
  const wbs = await getWbs(row.ProjectId, actorUserId);
  return { id: row.RequirementId, ...wbs };
}

/** Edit wording or the met tick (shared across deliverables); links and allocations left alone. */
export async function updateCascadeRequirement(
  input: { id: number; type: RequirementType; text: string; isMet: boolean; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  const row = await updateRequirementRow(
    {
      requirementId: input.id,
      type: input.type,
      text: input.text,
      isMet: input.isMet,
      validatesIds: null,
      deliverableIds: null,
      rowVer: input.rowVer,
    },
    actorUserId,
  );
  return getWbs(row.ProjectId, actorUserId);
}

/** Reorder one requirement within a deliverable's list (@RowVer is the allocation's). */
export async function moveCascadeRequirement(
  input: { itemId: number; id: number; position: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  const projectId = await moveRequirementAllocation(
    {
      requirementId: input.id,
      keyDeliverableId: input.itemId,
      position: input.position,
      rowVer: input.rowVer,
    },
    actorUserId,
  );
  return getWbs(projectId, actorUserId);
}

/** Take a requirement off one deliverable (@RowVer is the allocation's); it stays in the register. */
export async function removeCascadeRequirement(
  input: { itemId: number; id: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  const projectId = await unallocateRequirement(
    { requirementId: input.id, keyDeliverableId: input.itemId, rowVer: input.rowVer },
    actorUserId,
  );
  return getWbs(projectId, actorUserId);
}
