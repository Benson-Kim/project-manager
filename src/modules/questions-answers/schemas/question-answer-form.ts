import { z } from "zod";
import { messages } from "@/lib/messages";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS } from "./question-answer";

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

/**
 * An optional enum field that:
 *  - accepts "" (Select default / no selection) and transforms to null
 *  - accepts a valid enum member and passes it through
 *  - rejects any other string
 */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(values).optional().transform((v) => v ?? null),
  );

export const questionAnswerFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  question: z
    .string()
    .trim()
    .min(1, messages.questionsAnswers.questionRequired)
    .max(4000),
  answer: optionalText(4000),
  category: optionalEnum(CATEGORY_OPTIONS),
  priority: optionalEnum(PRIORITY_OPTIONS),
  assignedTo: optionalText(255),
});

export type QuestionAnswerFormValues = z.output<typeof questionAnswerFormSchema>;

export const updateQuestionAnswerFormSchema = questionAnswerFormSchema.extend({
  questionAnswerId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateQuestionAnswerFormValues = z.output<typeof updateQuestionAnswerFormSchema>;
