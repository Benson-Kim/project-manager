import { z } from "zod";
import { actorAccessSchema } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * AssumptionConstraint — zod contracts. Row schema mirrors the SELECT shape of
 * usp_AssumptionConstraint_{Create,GetById,List,Update}.
 *
 * Type and Impact are constrained to their respective allowlists at the form
 * and action boundaries (review comments #3 and #8). The row schema accepts
 * any string from the DB to avoid breakage when existing rows carry legacy values.
 */

/**
 * Dropdown lists (ADR-0022). The two kinds of record, "Assumption" and
 * "Constraint", are locked in the type list; more can be added.
 */
export const ASSUMPTION_CONSTRAINT_LISTS = [
  "assumption-constraint.type",
  "assumption-constraint.impact",
] as const satisfies readonly LookupListKey[];

export const assumptionConstraintRowSchema = z.object({
  AssumptionConstraintId: z.number().int(),
  ProjectId: z.number().int(),
  Type: z.string().nullable(),
  Description: z.string().nullable(),
  IsValidated: z.boolean(),
  Impact: z.string().nullable(),
  MitigationPlan: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type AssumptionConstraintRow = z.infer<typeof assumptionConstraintRowSchema>;

export const assumptionConstraintListRowSchema = assumptionConstraintRowSchema.extend({
  TotalCount: z.number().int(),
  ActorAccess: actorAccessSchema,
});

export type AssumptionConstraintListRow = z.infer<typeof assumptionConstraintListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createAssumptionConstraintInput = z.object({
  projectId: z.number().int().positive(),
  type: listValue.nullish(),
  description: z.string().trim().min(1).max(4000),
  isValidated: z.boolean().default(false),
  impact: listValue.nullish(),
  mitigationPlan: z.string().trim().max(4000).nullish(),
});

export type CreateAssumptionConstraintInput = z.input<typeof createAssumptionConstraintInput>;
export type CreateAssumptionConstraintParsed = z.infer<typeof createAssumptionConstraintInput>;

export const updateAssumptionConstraintInput = createAssumptionConstraintInput.extend({
  assumptionConstraintId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateAssumptionConstraintInput = z.input<typeof updateAssumptionConstraintInput>;

export const deleteAssumptionConstraintInput = z.object({
  assumptionConstraintId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteAssumptionConstraintInput = z.input<typeof deleteAssumptionConstraintInput>;
