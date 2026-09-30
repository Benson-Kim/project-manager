import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Daily Activity (app.DailyActivity ← tblDailyActivityList) — zod contracts.
 * Row schema mirrors the SELECT shape of usp_DailyActivity_{Create,GetById,List,Update}.
 */

/**
 * Task type vocabulary (requirements row 76: "Admin, Technical, Review, etc.").
 * Confirmed from Access data: row 13 shows "Technical". The checklist add-ons
 * suggest Admin, Technical, Review as minimum; Other covers unlisted values.
 */
export const TASK_TYPES = ["Admin", "Technical", "Review", "Meeting", "Other"] as const;

/**
 * Contact method vocabulary — Access source data values from tblDailyActivityList:
 * "Questions I have", "Meeting", "In Person", "Text Message", "Telephone", "To do".
 * The field is free-text in Access; we expose a curated dropdown + an "Other" catch-all
 * rather than locking to the Access values which include ad-hoc strings like "To do".
 */
export const CONTACT_METHODS = [
  "In Person",
  "Telephone",
  "Text Message",
  "Email",
  "Meeting",
  "Other",
] as const;

export const dailyActivityRowSchema = z.object({
  DailyActivityId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  ActivityStatusId: z.number().int().nullable(),
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
  TotalCount: z.number().int(),
});

export type DailyActivityListRow = z.infer<typeof dailyActivityListRowSchema>;

export const activityStatusSchema = z.object({
  ActivityStatusId: z.number().int(),
  Name: z.string(),
  SortOrder: z.number().int(),
});

export type ActivityStatus = z.infer<typeof activityStatusSchema>;

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
