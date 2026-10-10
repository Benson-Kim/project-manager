import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createKeyDeliverableInput,
  ganttRowSchema,
  isOverdue,
  keyDeliverableListRowSchema,
  keyDeliverableRowSchema,
  parseAssigneesJson,
  statusToCompletion,
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
 * KeyDeliverable repository — stored procedures only, every row
 * zod-parsed at the boundary (STANDARDS §2.5), list params forwarded 1:1.
 */

function toProcParams(input: CreateKeyDeliverableParsed) {
  return {
    ProjectId: input.projectId,
    KeyRequirement: input.keyRequirement,
    RequestedDate: input.requestedDate ?? null,
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
 * Bar start priority:
 *   1. RequestedDate (the date the deliverable was formally requested)
 *   2. CreatedAtUtc clamped to <= deadline (legacy / imported rows)
 *   3. ProjectStartDate (imported/seed rows whose CreatedAtUtc > deadline because
 *      the row was seeded after the project started — preserves project-duration bars)
 *   4. deadline itself (degenerate: all dates in the past with no project start)
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
      let start: Date;
      if (r.RequestedDate != null && r.RequestedDate.getTime() <= r.Deadline.getTime()) {
        start = r.RequestedDate;
      } else if (r.CreatedAtUtc.getTime() <= r.Deadline.getTime()) {
        start = r.CreatedAtUtc;
      } else if (
        r.ProjectStartDate != null &&
        r.ProjectStartDate.getTime() <= r.Deadline.getTime()
      ) {
        // Imported/seed rows: CreatedAtUtc is the seed timestamp (later than the
        // deadline), so fall back to the project start date to preserve the
        // project-duration bar.
        start = r.ProjectStartDate;
      } else {
        start = r.Deadline;
      }
      const rawNames = r.AssigneeNames?.trim() ?? "";
      return {
        id: r.KeyDeliverableId,
        requirement: r.KeyRequirement ?? "",
        start,
        end: r.Deadline,
        status: r.Status,
        priority: r.Priority,
        assigneeNames: rawNames || null,
        assignees: parseAssigneesJson(r.AssigneesJson),
        overdue: isOverdue(r.Deadline, r.Status, now),
        completionPct: statusToCompletion(r.Status),
      };
    });
}
