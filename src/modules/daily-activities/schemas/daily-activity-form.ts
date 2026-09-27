import { z } from "zod";
import { messages } from "@/lib/messages";
import { CONTACT_METHODS, TASK_TYPES } from "./daily-activity";

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
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), message)
    .transform((v) => (v ? Number(v) : null));

const vocab = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (values as readonly string[]).includes(v), messages.errors.VALIDATION)
    .transform((v) => (v ? (v as T[number]) : null));

export const dailyActivityFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
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
  contactMethod: vocab(CONTACT_METHODS),
  timeSpent: intInput(0, 9999, messages.dailyActivities.invalidTimeSpent),
  assignedTo: optionalText(255),
  taskType: vocab(TASK_TYPES),
  progress: intInput(0, 100, messages.dailyActivities.invalidNumber),
});

export type DailyActivityFormValues = z.output<typeof dailyActivityFormSchema>;

export const updateDailyActivityFormSchema = dailyActivityFormSchema.extend({
  dailyActivityId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateDailyActivityFormValues = z.output<typeof updateDailyActivityFormSchema>;
