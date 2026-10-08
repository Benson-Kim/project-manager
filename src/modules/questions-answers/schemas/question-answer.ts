import { z } from "zod";
import { actorAccessSchema } from "@/lib/auth/actor-access";
import { listValue, type LookupListKey } from "@/lib/lookup-lists";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * QuestionAnswer — zod contracts. Row schema mirrors the SELECT shape of
 * usp_QuestionAnswer_{Create,GetById,List,Update}.
 *
 * Category and Priority are constrained on the client (Select fields) but
 * stored as free-text NVARCHAR(255) in SQL so legacy / future values are not
 * rejected by the DB layer.
 */

/** Dropdown lists (ADR-0022; migration 018 replaced the CHECK constraints of migration 009). */
export const QUESTION_ANSWER_LISTS = [
  "question-answer.category",
  "question-answer.priority",
] as const satisfies readonly LookupListKey[];

export const questionAnswerRowSchema = z.object({
  QuestionAnswerId: z.number().int(),
  ProjectId: z.number().int().nullable(),
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
  ActorAccess: actorAccessSchema,
});

export type QuestionAnswerListRow = z.infer<typeof questionAnswerListRowSchema>;

// ── Mutation input schemas (used by repository) ───────────────────────────────

export const createQuestionAnswerInput = z.object({
  projectId: z.number().int().positive(),
  question: z.string().trim().min(1).max(4000),
  answer: z.string().trim().max(4000).nullish(),
  category: listValue.nullish(),
  priority: listValue.nullish(),
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
