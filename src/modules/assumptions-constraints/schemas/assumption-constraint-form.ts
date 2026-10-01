import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * AssumptionConstraint form contract — ONE schema shared by the client Sheet
 * form (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields;
 * checkbox "on"/absent → boolean.
 */

export const assumptionConstraintFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  type: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v)),
    z.string().max(255).nullable(),
  ),
  description: z
    .string()
    .trim()
    .min(1, messages.assumptionsConstraints.descriptionRequired)
    .max(4000),
  isValidated: z.preprocess(
    (v) => v === "on" || v === true || v === "true",
    z.boolean(),
  ),
  impact: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v).trim() || null),
    z.string().max(255).nullable(),
  ),
  mitigationPlan: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v).trim() || null),
    z.string().max(4000).nullable(),
  ),
});

export type AssumptionConstraintFormValues = z.output<typeof assumptionConstraintFormSchema>;

export const updateAssumptionConstraintFormSchema = assumptionConstraintFormSchema.extend({
  assumptionConstraintId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateAssumptionConstraintFormValues = z.output<
  typeof updateAssumptionConstraintFormSchema
>;
