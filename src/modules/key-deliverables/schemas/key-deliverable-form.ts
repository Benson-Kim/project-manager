import { z } from "zod";
import { messages } from "@/lib/messages";
import { DELIVERABLE_STATUSES, DELIVERABLE_PRIORITIES } from "./key-deliverable";

/**
 * Deliverable form contract ): ONE schema shared by the client Sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — coerced here into the repository
 * input shape.
 */
const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.keyDeliverables.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

/**
 * Optional enum field: empty string → null; non-empty values must be one of
 * the declared vocabulary so stale or forged payloads cannot persist
 * unrecognised strings (e.g. misspelled terminal statuses treated as overdue).
 */
function optionalEnum<T extends string>(values: readonly T[]) {
  return z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || (values as readonly string[]).includes(v),
      messages.errors.VALIDATION,
    )
    .transform((v): T | null => (v ? (v as T) : null));
}

/** Combobox hidden input submits the stakeholder id as a string ("" = none). */
const optionalId = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+$/.test(v), messages.errors.VALIDATION)
  .transform((v) => (v ? Number(v) : null));

export const keyDeliverableFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  keyRequirement: z.string().trim().min(1, messages.keyDeliverables.requirementRequired).max(4000),
  deadline: dateInput,
  assignedToStakeholderId: optionalId,
  priority: optionalEnum(DELIVERABLE_PRIORITIES),
  status: optionalEnum(DELIVERABLE_STATUSES),
});

export type KeyDeliverableFormValues = z.output<typeof keyDeliverableFormSchema>;

export const updateKeyDeliverableFormSchema = keyDeliverableFormSchema.extend({
  keyDeliverableId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateKeyDeliverableFormValues = z.output<typeof updateKeyDeliverableFormSchema>;
