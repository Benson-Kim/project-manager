import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { AssumptionConstraintRow } from "./assumption-constraint";

/**
 * AssumptionConstraint form contract — ONE schema shared by the client Sheet
 * form (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields.
 *
 * type, impact and validated are managed lists (ADR-0022): "" → null here; the
 * procs check the value against the live list, so forged payloads still can't
 * persist an unrecognised value (review comments #3/#8).
 */

export const assumptionConstraintFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  type: listChoice,
  description: z
    .string()
    .trim()
    .min(1, messages.assumptionsConstraints.descriptionRequired)
    .max(4000),
  validated: listChoice,
  impact: listChoice,
});

export type AssumptionConstraintFormValues = z.output<typeof assumptionConstraintFormSchema>;

export const updateAssumptionConstraintFormSchema = assumptionConstraintFormSchema.extend({
  assumptionConstraintId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateAssumptionConstraintFormValues = z.output<
  typeof updateAssumptionConstraintFormSchema
>;

/** An item as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function assumptionConstraintFormValues(row: AssumptionConstraintRow): FormValues {
  return {
    assumptionConstraintId: String(row.AssumptionConstraintId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    type: formText(row.Type),
    description: formText(row.Description),
    validated: formText(row.Validated),
    impact: formText(row.Impact),
  };
}
