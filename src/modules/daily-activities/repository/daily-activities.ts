import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { listActivityStatuses } from "@/lib/repositories/activity-status";
import {
  createDailyActivityInput,
  dailyActivityListRowSchema,
  dailyActivityRowSchema,
  updateDailyActivityInput,
  type CreateDailyActivityInput,
  type CreateDailyActivityParsed,
  type DailyActivityListRow,
  type DailyActivityRow,
  type UpdateDailyActivityInput,
} from "../schemas/daily-activity";

/** Module-specific filter params forwarded to usp_DailyActivity_List. */
export interface DailyActivityListFilters {
  activityStatusId?: number | null;
  taskType?: string | null;
}

export type { ActivityStatus } from "@/lib/repositories/activity-status";
export { listActivityStatuses };

/**
 * Daily Activity repository — stored procedures only , zod row
 * parsing (STANDARDS §2.5), list params forwarded 1:1 .
 */

function toProcParams(input: CreateDailyActivityParsed) {
  return {
    ActivityStatusId: input.activityStatusId ?? null,
    Requester: input.requester ?? null,
    Task: input.task ?? null,
    MyActivity: input.myActivity ?? null,
    ActivityDate: input.activityDate ?? null,
    Comments: input.comments ?? null,
    RequestDate: input.requestDate ?? null,
    Status: null, // legacy free-text column — excluded from usp_DailyActivity_Update SET clause; preserved as-is in DB
    CompleteDate: input.completeDate ?? null,
    ContactMethod: input.contactMethod ?? null,
    TimeSpent: input.timeSpent ?? null,
    AssignedTo: input.assignedTo ?? null,
    TaskType: input.taskType ?? null,
    Progress: input.progress ?? null,
  };
}

export async function createDailyActivity(
  input: CreateDailyActivityInput,
  actorUserId: number,
): Promise<DailyActivityRow> {
  const parsed = createDailyActivityInput.parse(input);
  const rows = await execProc<DailyActivityRow>("usp_DailyActivity_Create", {
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return dailyActivityRowSchema.parse(rows[0]);
}

export async function getDailyActivityById(
  dailyActivityId: number,
  actorUserId: number,
): Promise<DailyActivityRow> {
  const rows = await execProc<DailyActivityRow>("usp_DailyActivity_GetById", {
    DailyActivityId: dailyActivityId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "DailyActivity not found");
  return dailyActivityRowSchema.parse(rows[0]);
}

export async function listDailyActivities(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: DailyActivityListFilters = {},
): Promise<DailyActivityListRow[]> {
  const rows = await execProc<DailyActivityListRow>("usp_DailyActivity_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    ActivityStatusId: filters.activityStatusId ?? null,
    TaskType: filters.taskType ?? null,
  });
  return rows.map((r) => dailyActivityListRowSchema.parse(r));
}

export async function updateDailyActivity(
  input: UpdateDailyActivityInput,
  actorUserId: number,
): Promise<DailyActivityRow> {
  const parsed = updateDailyActivityInput.parse(input);
  const rows = await execProc<DailyActivityRow>("usp_DailyActivity_Update", {
    DailyActivityId: parsed.dailyActivityId,
    ProjectId: parsed.projectId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return dailyActivityRowSchema.parse(rows[0]);
}

export async function deleteDailyActivity(
  dailyActivityId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_DailyActivity_Delete", {
    DailyActivityId: dailyActivityId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

