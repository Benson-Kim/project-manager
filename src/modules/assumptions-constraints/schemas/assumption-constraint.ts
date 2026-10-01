import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * AssumptionConstraint — zod contracts. Row schema mirrors the SELECT shape of
 * usp_AssumptionConstraint_{Create,GetById,List,Update}.
 *
 * Type is stored as free-text NVARCHAR(255); the UI constrains it to
 * Assumption | Constraint | (empty) but we accept any string from the DB.
 */

export const ASSUMPTION_CONSTRAINT_TYPE_OPTIONS = ["Assumption", "Constraint"] as const;
export type AssumptionConstraintType = (typeof ASSUMPTION_CONSTRAINT_TYPE_OPTIONS)[number];

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
});

export type AssumptionConstraintListRow = z.infer<typeof assumptionConstraintListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createAssumptionConstraintInput = z.object({
  projectId: z.number().int().positive(),
  type: z.string().trim().max(255).nullish(),
  description: z.string().trim().min(1).max(4000),
  isValidated: z.boolean().default(false),
  impact: z.string().trim().max(255).nullish(),
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
