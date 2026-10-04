import { z } from "zod";
import { messages } from "@/lib/messages";
import {
  ASSUMPTION_CONSTRAINT_TYPE_OPTIONS,
  ASSUMPTION_CONSTRAINT_IMPACT_OPTIONS,
} from "./assumption-constraint";

/**
 * AssumptionConstraint form contract — ONE schema shared by the client Sheet
 * form (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields;
 * checkbox "on"/absent → boolean.
 *
 * type and impact use the optionalEnum pattern from key-deliverable-form.ts:
 * empty string → null, non-empty strings validated against the allowlist so
 * forged payloads cannot persist unrecognised values (review comments #3/#8).
 */

/**
 * Optional enum field (mirrors key-deliverable-form.ts pattern):
 * empty string/absent → null; non-empty must match the declared vocabulary.
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

export const assumptionConstraintFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  type: optionalEnum(ASSUMPTION_CONSTRAINT_TYPE_OPTIONS),
  description: z
    .string()
    .trim()
    .min(1, messages.assumptionsConstraints.descriptionRequired)
    .max(4000),
  isValidated: z.preprocess(
    (v) => v === "on" || v === true || v === "true",
    z.boolean(),
  ),
  impact: optionalEnum(ASSUMPTION_CONSTRAINT_IMPACT_OPTIONS),
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
