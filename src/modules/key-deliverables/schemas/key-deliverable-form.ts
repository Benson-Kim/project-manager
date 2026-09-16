import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * Deliverable form contract (ADR-0009): ONE schema shared by the client Sheet
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

const optionalChoice = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((v) => (v ? v : null));

/** Combobox hidden input submits the stakeholder id as a string ("" = none). */
const optionalId = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+$/.test(v), messages.errors.VALIDATION)
  .transform((v) => (v ? Number(v) : null));

export const keyDeliverableFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  keyRequirement: z
    .string()
    .trim()
    .min(1, messages.keyDeliverables.requirementRequired)
    .max(4000),
  deadline: dateInput,
  assignedToStakeholderId: optionalId,
  priority: optionalChoice,
  status: optionalChoice,
});

export type KeyDeliverableFormValues = z.output<typeof keyDeliverableFormSchema>;

export const updateKeyDeliverableFormSchema = keyDeliverableFormSchema.extend({
  keyDeliverableId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateKeyDeliverableFormValues = z.output<typeof updateKeyDeliverableFormSchema>;
