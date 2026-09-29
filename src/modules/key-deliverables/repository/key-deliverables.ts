import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createKeyDeliverableInput,
  ganttRowSchema,
  isOverdue,
  keyDeliverableListRowSchema,
  keyDeliverableRowSchema,
  updateKeyDeliverableInput,
  type CreateKeyDeliverableInput,
  type CreateKeyDeliverableParsed,
  type GanttBar,
  type GanttRow,
  type KeyDeliverableFilters,
  type KeyDeliverableListRow,
  type KeyDeliverableRow,
  type UpdateKeyDeliverableInput,
} from "../schemas/key-deliverable";

/**
 * KeyDeliverable repository — stored procedures only , every row
 * zod-parsed at the boundary (STANDARDS §2.5), list params forwarded 1:1
 * .
 */

function toProcParams(input: CreateKeyDeliverableParsed) {
  return {
    ProjectId: input.projectId,
    KeyRequirement: input.keyRequirement,
    Deadline: input.deadline ?? null,
    AssignedToStakeholderId: input.assignedToStakeholderId ?? null,
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
    ...toProcParams(parsed),
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
    ...toProcParams(parsed),
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

/**
 * Gantt data (usp_KeyDeliverable_GanttData): map rows to drawable bars.
 * Bar start = ProjectStartDate when available (the intended chart-window basis
 * returned by the procedure), falling back to CreatedAtUtc clamped to the
 * deadline so imported rows with a past deadline never produce start > end.
 * Rows without a deadline are not drawable and are skipped.
 */
export async function getGanttBars(
  projectId: number,
  actorUserId: number,
  now: Date = new Date(),
): Promise<GanttBar[]> {
  const rows = await execProc<GanttRow>("usp_KeyDeliverable_GanttData", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows
    .map((r) => ganttRowSchema.parse(r))
    .filter((r): r is GanttRow & { Deadline: Date } => r.Deadline !== null)
    .map((r) => {
      // Prefer the project's StartDate as the bar origin so that historical
      // (imported) deadlines produce meaningful durations rather than
      // zero-width markers caused by CreatedAtUtc > Deadline.
      const projectStart = r.ProjectStartDate;
      const fallback =
        r.CreatedAtUtc.getTime() <= r.Deadline.getTime() ? r.CreatedAtUtc : r.Deadline;
      const start =
        projectStart !== null && projectStart.getTime() <= r.Deadline.getTime()
          ? projectStart
          : fallback;
      return {
        id: r.KeyDeliverableId,
        requirement: r.KeyRequirement ?? "",
        start,
        end: r.Deadline,
        status: r.Status,
        priority: r.Priority,
        assignedToName: r.AssignedToName?.trim() ? r.AssignedToName.trim() : null,
        overdue: isOverdue(r.Deadline, r.Status, now),
      };
    });
}
