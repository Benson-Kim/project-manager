"use server";

import { action } from "@/lib/action";
import {
  createQuestionAnswer,
  deleteQuestionAnswer,
  updateQuestionAnswer,
} from "../repository/question-answers";
import { questionAnswerFormSchema, updateQuestionAnswerFormSchema } from "../schemas/question-answer-form";
import { deleteQuestionAnswerInput } from "../schemas/question-answer";

/**
 * Create a Q&A record (RBAC questions-answers:create — Admin + PM; audited in-proc).
 * Contributor cannot create (delete = false; create = false per RBAC matrix).
 */
export const createQuestionAnswerAction = action({
  name: "questions-answers.create",
  schema: questionAnswerFormSchema,
  permission: "questions-answers:create",
  handler: (input, ctx) => createQuestionAnswer(input, ctx.session.userId),
});

/**
 * Update a Q&A record (RBAC questions-answers:update — Admin + PM + Contributor;
 * audited in-proc).
 */
export const updateQuestionAnswerAction = action({
  name: "questions-answers.update",
  schema: updateQuestionAnswerFormSchema,
  permission: "questions-answers:update",
  handler: (input, ctx) => updateQuestionAnswer(input, ctx.session.userId),
});

/**
 * Soft-delete a Q&A record (RBAC questions-answers:delete — Admin + PM only;
 * audited in-proc).
 */
export const deleteQuestionAnswerAction = action({
  name: "questions-answers.delete",
  schema: deleteQuestionAnswerInput,
  permission: "questions-answers:delete",
  handler: async (input, ctx) => {
    await deleteQuestionAnswer(input.questionAnswerId, input.rowVer, ctx.session.userId);
    return { questionAnswerId: input.questionAnswerId };
  },
});
