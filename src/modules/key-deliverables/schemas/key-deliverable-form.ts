import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * Deliverable form contract: ONE schema shared by the client Sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — coerced here into the repository
 * input shape.
 *
 * Changes (migration 015):
 * - requestedDate: optional date input (same coercion as deadline).
 * - deadline: now labelled "Expected date" in the UI; column unchanged.
 * - assigneeIds: repeating hidden inputs named "assigneeIds[]" submit
 *   multiple stakeholder IDs; coerced to number[].
 */
const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.keyDeliverables.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

const optionalChoice = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((v) => (v ? v : null));

/** Single "assigneeIds[]" entry — numeric string or empty. */
const assigneeIdEntry = z
  .string()
  .trim()
  .refine((v) => !v || /^\d+$/.test(v), messages.errors.VALIDATION)
  .transform((v) => (v ? Number(v) : null));

export const keyDeliverableFormSchema = z
  .object({
    projectId: z.coerce.number().int().positive(),
    keyRequirement: z.string().trim().min(1, messages.keyDeliverables.requirementRequired).max(4000),
    requestedDate: dateInput,
    deadline: dateInput,
    /** FormData submits repeating fields as string[]. May arrive as a single string too. */
    "assigneeIds[]": z.union([z.string(), z.array(z.string())]).optional(),
    priority: optionalChoice,
    status: optionalChoice,
  })
  .transform((raw) => {
    const raw_ = raw["assigneeIds[]"];
    const entries = raw_ === undefined ? [] : Array.isArray(raw_) ? raw_ : [raw_];
    const assigneeIds = entries
      .map((v) => assigneeIdEntry.parse(v))
      .filter((v): v is number => v !== null);
    return {
      projectId: raw.projectId,
      keyRequirement: raw.keyRequirement,
      requestedDate: raw.requestedDate,
      deadline: raw.deadline,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : null,
      priority: raw.priority,
      status: raw.status,
    };
  });

export type KeyDeliverableFormValues = z.output<typeof keyDeliverableFormSchema>;

export const updateKeyDeliverableFormSchema = keyDeliverableFormSchema.and(
  z.object({
    keyDeliverableId: z.coerce.number().int().positive(),
    rowVer: z.coerce.number().int().nonnegative(),
  }),
);

export type UpdateKeyDeliverableFormValues = z.output<typeof updateKeyDeliverableFormSchema>;
