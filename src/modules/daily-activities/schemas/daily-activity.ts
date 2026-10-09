import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import type { LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Daily Activity (app.DailyActivity ← tblDailyActivityList) — zod contracts.
 * Row schema mirrors the SELECT shape of usp_DailyActivity_{Create,GetById,List,Update}.
 */

/**
 * Dropdown lists (ADR-0022, seeded by migration 018): the status (stored by
 * option id in ActivityStatusId), the contact method — Access data held ad-hoc
 * values such as "Questions I have", which records keep until changed — and the
 * task type (requirements row 76: "Admin, Technical, Review, etc.").
 */
export const DAILY_ACTIVITY_LISTS = [
  "daily-activity.status",
  "daily-activity.contact-method",
  "daily-activity.task-type",
] as const satisfies readonly LookupListKey[];

export const dailyActivityRowSchema = z.object({
  DailyActivityId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  ActivityStatusId: z.number().int().nullable(),
  /** The status option's label (live or retired), joined by every proc that returns rows. */
  ActivityStatus: z.string().nullable(),
  Requester: z.string().nullable(),
  Task: z.string().nullable(),
  MyActivity: z.string().nullable(),
  ActivityDate: z.date().nullable(),
  Comments: z.string().nullable(),
  RequestDate: z.date().nullable(),
  Status: z.string().nullable(),
  CompleteDate: z.date().nullable(),
  ContactMethod: z.string().nullable(),
  TimeSpent: z.number().int().nullable(),
  AssignedTo: z.string().nullable(),
  TaskType: z.string().nullable(),
  Progress: z.number().int().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type DailyActivityRow = z.infer<typeof dailyActivityRowSchema>;

export const dailyActivityListRowSchema = dailyActivityRowSchema.extend({
  /** The project's name — the datasheet's Project column (null: project-less). */
  ProjectName: z.string().nullable(),
  TotalCount: z.number().int(),
  ...actorAccessFields,
});

export type DailyActivityListRow = z.infer<typeof dailyActivityListRowSchema>;

export const createDailyActivityInput = z.object({
  projectId: z.number().int().positive().nullable(),
  activityStatusId: z.number().int().positive().nullish(),
  requester: z.string().trim().max(255).nullish(),
  task: z.string().trim().nullish(),
  myActivity: z.string().trim().nullish(),
  activityDate: z.coerce.date().nullish(),
  comments: z.string().trim().nullish(),
  requestDate: z.coerce.date().nullish(),
  status: z.string().trim().max(255).nullish(),
  completeDate: z.coerce.date().nullish(),
  contactMethod: z.string().trim().max(255).nullish(),
  timeSpent: z.number().int().min(0).max(9999).nullish(),
  assignedTo: z.string().trim().max(255).nullish(),
  taskType: z.string().trim().max(255).nullish(),
  progress: z.number().int().min(0).max(100).nullish(),
});

export type CreateDailyActivityInput = z.input<typeof createDailyActivityInput>;
export type CreateDailyActivityParsed = z.infer<typeof createDailyActivityInput>;

export const updateDailyActivityInput = createDailyActivityInput.extend({
  dailyActivityId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateDailyActivityInput = z.input<typeof updateDailyActivityInput>;

export const deleteDailyActivityInput = z.object({
  dailyActivityId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteDailyActivityInput = z.input<typeof deleteDailyActivityInput>;
