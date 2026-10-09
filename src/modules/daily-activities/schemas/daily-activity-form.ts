import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { toDateInput } from "@/lib/format";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { DailyActivityRow } from "./daily-activity";

/**
 * Daily Activity form contract ): ONE schema shared by the client
 * sheet form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — coerced to typed values here.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optionalLongText = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null));

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.dailyActivities.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

const intInput = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max),
      message,
    )
    .transform((v) => (v ? Number(v) : null));

export const dailyActivityFormSchema = z.object({
  // FormData emits "" or "0" when no project is selected (global create).
  // Coerce both to null so the repo receives NULL rather than 0.
  projectId: z
    .union([z.literal(""), z.literal("0"), z.null()])
    .transform(() => null)
    .or(z.coerce.number().int().positive()),
  activityStatusId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().positive().nullable()),
  requester: optionalText(255),
  task: optionalLongText(),
  myActivity: optionalLongText(),
  activityDate: dateInput,
  comments: optionalLongText(),
  requestDate: dateInput,
  completeDate: dateInput,
  /** Managed lists (ADR-0022): the proc checks the value against the live options. */
  contactMethod: listChoice,
  timeSpent: intInput(0, 9999, messages.dailyActivities.invalidTimeSpent),
  assignedTo: optionalText(255),
  taskType: listChoice,
  progress: intInput(0, 100, messages.dailyActivities.invalidNumber),
});

export type DailyActivityFormValues = z.output<typeof dailyActivityFormSchema>;

export const updateDailyActivityFormSchema = dailyActivityFormSchema.extend({
  dailyActivityId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateDailyActivityFormValues = z.output<typeof updateDailyActivityFormSchema>;

/** An activity as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function dailyActivityFormValues(row: DailyActivityRow): FormValues {
  return {
    dailyActivityId: String(row.DailyActivityId),
    rowVer: String(row.RowVer),
    projectId: formText(row.ProjectId),
    activityStatusId: formText(row.ActivityStatusId),
    requester: formText(row.Requester),
    task: formText(row.Task),
    myActivity: formText(row.MyActivity),
    activityDate: toDateInput(row.ActivityDate),
    comments: formText(row.Comments),
    requestDate: toDateInput(row.RequestDate),
    completeDate: toDateInput(row.CompleteDate),
    contactMethod: formText(row.ContactMethod),
    timeSpent: formText(row.TimeSpent),
    assignedTo: formText(row.AssignedTo),
    taskType: formText(row.TaskType),
    progress: formText(row.Progress),
  };
}
