import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createRequirement as createRequirementRow,
  moveRequirement as moveRequirementAllocation,
  setRequirementMoscow,
  setRequirementPlanning,
  unallocateRequirement,
  updateRequirement as updateRequirementRow,
} from "@/modules/requirements/repository/requirements";
import type {
  SetMoscowInput,
  SetPlanningInput,
} from "@/modules/requirements/schemas/requirement-planning";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import type { SolutionType } from "@/modules/requirements/schemas/requirement-types";
import {
  createKeyDeliverableInput,
  keyDeliverableListRowSchema,
  keyDeliverableRowSchema,
  parsePredecessorsJson,
  rowVerSchema,
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
import type { DependencyType } from "../schemas/wbs-dependencies";
import { buildWbs } from "../schemas/wbs";

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
    Budget: parsed.budget ?? null,
    ParentKeyDeliverableId: parsed.parentId ?? null,
    AfterKeyDeliverableId: parsed.afterId ?? null,
    IsMilestone: parsed.isMilestone ?? false,
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
  const rows = await execProc<KeyDeliverableRow>("usp_KeyDeliverable_Update", {
    ...updateParams(input),
    ActorUserId: actorUserId,
  });
  return keyDeliverableRowSchema.parse(rows[0]);
}

/** usp_KeyDeliverable_Update's parameters: an omitted colour or budget is kept. */
function updateParams(input: UpdateKeyDeliverableInput) {
  const parsed = updateKeyDeliverableInput.parse(input);
  return {
    KeyDeliverableId: parsed.keyDeliverableId,
    ...fieldParams(parsed),
    Color: parsed.color ?? null,
    ColorSet: parsed.color === undefined ? 0 : 1,
    Budget: parsed.budget ?? null,
    BudgetSet: parsed.budget === undefined ? 0 : 1,
    RowVer: parsed.rowVer,
  };
}

/** The WBS details panel's save (ADR-0052): the sheet's update, answered with the breakdown. */
export function updateWbsItem(
  input: UpdateKeyDeliverableInput,
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter("usp_KeyDeliverable_Update", updateParams(input), actorUserId);
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
  const itemRows = rows.filter((r) => r.KeyDeliverableId != null);
  return {
    items: itemRows.map((r) => wbsRowSchema.parse(r)),
    // Each row carries the links it is the successor of, so the graph arrives once; flattened here
    // because the editor draws it across rows and the tree functions take no part in it (ADR-0046).
    links: itemRows.flatMap((r) =>
      parsePredecessorsJson(r.PredecessorsJson, r.KeyDeliverableId as number),
    ),
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

/**
 * Link two items in sequence (ADR-0046). The proc refuses a self-link, a duplicate pair, an
 * ancestor pair and a cycle, then reschedules whatever the new link pushes, so the answer is the
 * whole breakdown rather than the link alone.
 */
export function linkWbsItems(
  input: { predecessorId: number; successorId: number; type: DependencyType; lagDays: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableDependency_Link",
    {
      PredecessorId: input.predecessorId,
      SuccessorId: input.successorId,
      DependencyType: input.type,
      LagDays: input.lagDays,
    },
    actorUserId,
  );
}

/** Change a link's type or lag (@RowVer is the link's); its ends never move. */
export function relinkWbsItems(
  input: { id: number; type: DependencyType; lagDays: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableDependency_Relink",
    {
      DependencyId: input.id,
      DependencyType: input.type,
      LagDays: input.lagDays,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

/** Unlink two items (@RowVer is the link's). Nothing is pulled back: the cascade only pushes. */
export function unlinkWbsItems(
  input: { id: number; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverableDependency_Unlink",
    { DependencyId: input.id, RowVer: input.rowVer },
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

/** Turn an item into a milestone, or back into a task (ADR-0046). */
export function setWbsItemMilestone(
  input: { id: number; isMilestone: boolean; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_SetMilestone",
    { KeyDeliverableId: input.id, IsMilestone: input.isMilestone, RowVer: input.rowVer },
    actorUserId,
  );
}

/** Replace the paperclip note on one item (ADR-0052). */
export function setWbsItemNote(
  input: { id: number; note: string; rowVer: number },
  actorUserId: number,
): Promise<WbsData> {
  return wbsAfter(
    "usp_KeyDeliverable_SetNote",
    { KeyDeliverableId: input.id, Note: input.note, RowVer: input.rowVer },
    actorUserId,
  );
}

/** Replace the project's sticky note (ADR-0052); answers with the project's new RowVer. */
export async function setPlanNote(
  input: { projectId: number; note: string; rowVer: number },
  actorUserId: number,
): Promise<{ rowVer: number }> {
  const rows = await execProc<{ RowVer: unknown }>("usp_KeyDeliverable_SetPlanNote", {
    ProjectId: input.projectId,
    PlanNote: input.note,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return { rowVer: rowVerSchema.parse(rows[0]?.RowVer) };
}

/** An option of the requirement register's deliverable picker: "1.2 Site survey". */
export interface DeliverableOption {
  id: number;
  label: string;
}

/**
 * The project's deliverables for a picker, in breakdown order with their WBS numbering. Reads the
 * same breakdown as the editor, so the numbers a person sees in the WBS are the ones they pick by.
 */
export async function listDeliverableOptions(
  projectId: number,
  actorUserId: number,
): Promise<DeliverableOption[]> {
  const { items } = await getWbs(projectId, actorUserId);
  const wbs = buildWbs(items);
  return wbs.order.map((id) => {
    const node = wbs.nodes.get(id)!;
    const name = node.item.name.trim();
    return { id, label: name ? `${node.code} ${name}` : node.code };
  });
}

/*
 * The WBS/Gantt requirements cascade (ADR-0037). A requirement is a project-level record owned by
 * the requirements module; these go through that module's write procs, then answer with the whole
 * breakdown so the editor replaces its guess. They never touch trace links or other allocations.
 */

/** Create a requirement already allocated to one deliverable; answers with its id too. */
export async function addCascadeRequirement(
  input: {
    projectId: number;
    itemId: number;
    type: SolutionType;
    text: string;
    moscow?: MoSCoW | null;
    parentRequirementId?: number | null;
    meetsId?: number | null;
  },
  actorUserId: number,
): Promise<WbsData & { id: number }> {
  const row = await createRequirementRow(
    {
      projectId: input.projectId,
      type: input.type,
      text: input.text,
      isMet: false,
      // A parent makes it a sub-requirement in the register's own tree (ADR-0048); the proc takes
      // the parent's type and refuses one from another project or past the depth limit.
      parentRequirementId: input.parentRequirementId ?? null,
      validatesIds: input.meetsId ? [input.meetsId] : null,
      deliverableIds: [input.itemId],
      moscow: input.moscow ?? null,
      acceptanceCriteria: null,
      estimateDays: null,
      ownerStakeholderId: null,
    },
    actorUserId,
  );
  const wbs = await getWbs(row.ProjectId, actorUserId);
  return { id: row.RequirementId, ...wbs };
}

/** Edit wording or the met tick (shared across deliverables); links and allocations left alone. */
export async function updateCascadeRequirement(
  input: { id: number; type: SolutionType; text: string; isMet: boolean; rowVer: number },
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

/** One MoSCoW chip on the work breakdown or the Gantt (ADR-0052); answers with the breakdown. */
export async function setCascadeMoscow(
  input: SetMoscowInput,
  actorUserId: number,
): Promise<WbsData> {
  const row = await setRequirementMoscow(input, actorUserId);
  return getWbs(row.ProjectId, actorUserId);
}

/** Criteria, estimate and owner from the work breakdown or the Gantt (ADR-0052). */
export async function setCascadePlanning(
  input: SetPlanningInput,
  actorUserId: number,
): Promise<WbsData> {
  const row = await setRequirementPlanning(input, actorUserId);
  return getWbs(row.ProjectId, actorUserId);
}
