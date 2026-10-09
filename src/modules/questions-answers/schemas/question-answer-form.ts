import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { QuestionAnswerRow } from "./question-answer";

/**
 * QuestionAnswer form contract — ONE schema shared by the client Sheet form
 * (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const questionAnswerFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  question: z.string().trim().min(1, messages.questionsAnswers.questionRequired).max(4000),
  answer: optionalText(4000),
  /** Managed lists (ADR-0022): the proc checks the value against the live options. */
  category: listChoice,
  priority: listChoice,
  assignedTo: optionalText(255),
});

export type QuestionAnswerFormValues = z.output<typeof questionAnswerFormSchema>;

export const updateQuestionAnswerFormSchema = questionAnswerFormSchema.extend({
  questionAnswerId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateQuestionAnswerFormValues = z.output<typeof updateQuestionAnswerFormSchema>;

/** A Q&A record as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function questionAnswerFormValues(row: QuestionAnswerRow): FormValues {
  return {
    questionAnswerId: String(row.QuestionAnswerId),
    rowVer: String(row.RowVer),
    projectId: formText(row.ProjectId),
    question: row.Question,
    answer: formText(row.Answer),
    category: formText(row.Category),
    priority: formText(row.Priority),
    assignedTo: formText(row.AssignedTo),
  };
}
