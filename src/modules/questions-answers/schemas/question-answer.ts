import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * QuestionAnswer — zod contracts. Row schema mirrors the SELECT shape of
 * usp_QuestionAnswer_{Create,GetById,List,Update}.
 *
 * Category and Priority are constrained on the client (Select fields) but
 * stored as free-text NVARCHAR(255) in SQL so legacy / future values are not
 * rejected by the DB layer.
 */

export const CATEGORY_OPTIONS = ["General", "Technical", "Budget", "Other"] as const;
export const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"] as const;

export type QACategory = (typeof CATEGORY_OPTIONS)[number];
export type QAPriority = (typeof PRIORITY_OPTIONS)[number];

export const questionAnswerRowSchema = z.object({
  QuestionAnswerId: z.number().int(),
  ProjectId: z.number().int(),
  Question: z.string(),
  Answer: z.string().nullable(),
  Category: z.string().nullable(),
  Priority: z.string().nullable(),
  AssignedTo: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type QuestionAnswerRow = z.infer<typeof questionAnswerRowSchema>;

export const questionAnswerListRowSchema = questionAnswerRowSchema.extend({
  TotalCount: z.number().int(),
});

export type QuestionAnswerListRow = z.infer<typeof questionAnswerListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createQuestionAnswerInput = z.object({
  projectId: z.number().int().positive(),
  question: z.string().trim().min(1).max(4000),
  answer: z.string().trim().max(4000).nullish(),
  category: z.enum(CATEGORY_OPTIONS).nullish(),
  priority: z.enum(PRIORITY_OPTIONS).nullish(),
  assignedTo: z.string().trim().max(255).nullish(),
});

export type CreateQuestionAnswerInput = z.input<typeof createQuestionAnswerInput>;
export type CreateQuestionAnswerParsed = z.infer<typeof createQuestionAnswerInput>;

export const updateQuestionAnswerInput = createQuestionAnswerInput.extend({
  questionAnswerId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateQuestionAnswerInput = z.input<typeof updateQuestionAnswerInput>;

export const deleteQuestionAnswerInput = z.object({
  questionAnswerId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteQuestionAnswerInput = z.input<typeof deleteQuestionAnswerInput>;
