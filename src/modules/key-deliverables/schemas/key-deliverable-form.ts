import { z } from "zod";
import type { FormValues } from "@/components/ui/data-view/datasheet";
import { datesInOrder } from "@/lib/date-range";
import { toDateInput } from "@/lib/format";
import { OPTION_COLORS, listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { KeyDeliverableRow } from "./key-deliverable";

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
 *
 * Work breakdown (migration 032, ADR-0027): startDate is required (checklist
 * row 67) and the deadline may not come before it; color is a palette key, or
 * empty for the parent's colour. Where the item sits in the breakdown is the
 * WBS editor's business, not this form's.
 */
const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.keyDeliverables.invalidDate)
  .transform((v) => (v ? new Date(v) : null));

/** A required date: same coercion, but empty is an error. */
const requiredDateInput = z
  .string({ error: messages.keyDeliverables.startDateRequired })
  .trim()
  .min(1, messages.keyDeliverables.startDateRequired)
  .refine((v) => !Number.isNaN(Date.parse(v)), messages.keyDeliverables.invalidDate)
  .transform((v) => new Date(v));

/** "" = the parent's colour (null); otherwise a palette key. */
const colorInput = z
  .union([z.literal(""), z.enum(OPTION_COLORS)])
  .optional()
  .transform((v) => (v ? v : null));

/** Single "assigneeIds[]" entry — numeric string or empty, validated inside the schema. */
const assigneeIdEntry = z
  .string()
  .trim()
  .refine((v) => !v || /^\d+$/.test(v), messages.errors.VALIDATION)
  .transform((v) => (v ? Number(v) : null));

export const keyDeliverableFormSchema = z
  .object({
    projectId: z.coerce.number().int().positive(),
    keyRequirement: z
      .string()
      .trim()
      .min(1, messages.keyDeliverables.requirementRequired)
      .max(4000),
    requestedDate: dateInput,
    startDate: requiredDateInput,
    deadline: dateInput,
    color: colorInput,
    /** FormData submits repeating fields as string[]. May arrive as a single string too.
     *  Each entry is validated by assigneeIdEntry here so that a malformed value
     *  produces a safeParse failure rather than a thrown ZodError from inside a transform. */
    "assigneeIds[]": z.union([assigneeIdEntry, z.array(assigneeIdEntry)]).optional(),
    /** Managed lists (ADR-0022): the proc checks the value against the live options. */
    priority: listChoice,
    status: listChoice,
  })
  .superRefine(
    datesInOrder(
      {
        start: "requestedDate",
        end: "deadline",
        message: messages.errors.dateOrder(
          messages.keyDeliverables.deadline,
          messages.keyDeliverables.requestedDate,
        ),
      },
      {
        start: "startDate",
        end: "deadline",
        message: messages.errors.dateOrder(
          messages.keyDeliverables.deadline,
          messages.keyDeliverables.startDate,
        ),
      },
    ),
  )
  .transform((raw) => {
    const raw_ = raw["assigneeIds[]"];
    // After validation each entry is already number | null; flatten single → array.
    const entries: (number | null)[] =
      raw_ === undefined ? [] : Array.isArray(raw_) ? raw_ : [raw_];
    // Deduplicate before reaching the proc — a forged payload with repeated IDs
    // would otherwise cause a primary-key violation in the junction table.
    const assigneeIds = [...new Set(entries.filter((v): v is number => v !== null))];
    return {
      projectId: raw.projectId,
      keyRequirement: raw.keyRequirement,
      requestedDate: raw.requestedDate,
      startDate: raw.startDate,
      deadline: raw.deadline,
      color: raw.color,
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

/** A deliverable as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function deliverableFormValues(row: KeyDeliverableRow): FormValues {
  return {
    keyDeliverableId: String(row.KeyDeliverableId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId ?? ""),
    keyRequirement: row.KeyRequirement ?? "",
    requestedDate: toDateInput(row.RequestedDate),
    startDate: toDateInput(row.StartDate),
    deadline: toDateInput(row.Deadline),
    color: row.Color ?? "",
    "assigneeIds[]": row.Assignees.map((a) => String(a.id)),
    priority: row.Priority ?? "",
    status: row.Status ?? "",
  };
}
