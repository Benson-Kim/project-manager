import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Objectives — zod contracts. Row schema mirrors
 * the SELECT shape of usp_Objective_{Create,GetById,List,Update}.
 */

export const objectiveRowSchema = z.object({
  ObjectiveId: z.number().int(),
  ProjectId: z.number().int(),
  QMeasurable: z.string().nullable(),
  QSuccess: z.string().nullable(),
  QAlignmentStrategy: z.string().nullable(),
  ObjectiveText: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type ObjectiveRow = z.infer<typeof objectiveRowSchema>;

export const objectiveListRowSchema = objectiveRowSchema.extend({
  TotalCount: z.number().int(),
});

export type ObjectiveListRow = z.infer<typeof objectiveListRowSchema>;

export const createObjectiveInput = z.object({
  projectId: z.number().int().positive(),
  objectiveText: z.string().trim().min(1).max(2000).nullable(),
  qMeasurable: z.string().trim().max(255).nullish(),
  qSuccess: z.string().trim().max(2000).nullish(),
  qAlignmentStrategy: z.string().trim().max(255).nullish(),
});

export type CreateObjectiveInput = z.input<typeof createObjectiveInput>;
export type CreateObjectiveParsed = z.infer<typeof createObjectiveInput>;

export const updateObjectiveInput = createObjectiveInput.extend({
  objectiveId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateObjectiveInput = z.input<typeof updateObjectiveInput>;

export const deleteObjectiveInput = z.object({
  objectiveId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteObjectiveInput = z.input<typeof deleteObjectiveInput>;
