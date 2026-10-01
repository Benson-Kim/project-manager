import { z } from "zod";
import { messages } from "@/lib/messages";
import { DELIVERABLE_STATUSES, DELIVERABLE_PRIORITIES } from "./key-deliverable";

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

/** Validated enum choice — empty string maps to null, invalid values are rejected. */
const statusChoice = z
  .enum(["", ...DELIVERABLE_STATUSES])
  .optional()
  .transform((v) => (v ? (v as (typeof DELIVERABLE_STATUSES)[number]) : null));

const priorityChoice = z
  .enum(["", ...DELIVERABLE_PRIORITIES])
  .optional()
  .transform((v) => (v ? (v as (typeof DELIVERABLE_PRIORITIES)[number]) : null));

/** Single "assigneeIds[]" entry — numeric string or empty, validated inside the schema. */
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
    /** FormData submits repeating fields as string[]. May arrive as a single string too.
     *  Each entry is validated by assigneeIdEntry here so that a malformed value
     *  produces a safeParse failure rather than a thrown ZodError from inside a transform. */
    "assigneeIds[]": z.union([assigneeIdEntry, z.array(assigneeIdEntry)]).optional(),
    priority: priorityChoice,
    status: statusChoice,
  })
  .transform((raw) => {
    const raw_ = raw["assigneeIds[]"];
    // After validation each entry is already number | null; flatten single → array.
    const entries: (number | null)[] = raw_ === undefined ? [] : Array.isArray(raw_) ? raw_ : [raw_];
    // Deduplicate before reaching the proc — a forged payload with repeated IDs
    // would otherwise cause a primary-key violation in the junction table.
    const assigneeIds = [...new Set(entries.filter((v): v is number => v !== null))];
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
