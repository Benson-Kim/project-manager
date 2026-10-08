import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { messages } from "@/lib/messages";
import type { ObjectiveRow } from "./objective";

/**
 * Objective form contract: ONE schema shared by the client sheet form
 * (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for all optional fields.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const objectiveFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  objectiveText: z.string().trim().min(1, messages.objectives.objectiveTextRequired).max(2000),
  qMeasurable: optionalText(255),
  qSuccess: optionalText(2000),
  qAlignmentStrategy: optionalText(255),
});

export type ObjectiveFormValues = z.output<typeof objectiveFormSchema>;

export const updateObjectiveFormSchema = objectiveFormSchema.extend({
  objectiveId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateObjectiveFormValues = z.output<typeof updateObjectiveFormSchema>;

/** An objective as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function objectiveFormValues(row: ObjectiveRow): FormValues {
  return {
    objectiveId: String(row.ObjectiveId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    objectiveText: formText(row.ObjectiveText),
    qMeasurable: formText(row.QMeasurable),
    qSuccess: formText(row.QSuccess),
    qAlignmentStrategy: formText(row.QAlignmentStrategy),
  };
}
