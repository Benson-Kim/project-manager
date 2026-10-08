import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { messages } from "@/lib/messages";
import type { KeywordRow } from "./keyword";

/**
 * Keyword form contract ): ONE schema shared by the client sheet
 * form (blur + submit validation over FormData strings) and the server
 * actions. FormData values are strings — "" → null for the optional definition.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const keywordFormSchema = z.object({
  projectId: z.preprocess(
    (v) => (v === "" || v === "0" || v === 0 ? null : v),
    z.coerce.number().int().positive().nullable(),
  ),
  keyword: z.string().trim().min(1, messages.keywords.keywordRequired).max(255),
  definition: optionalText(255),
});

export type KeywordFormValues = z.output<typeof keywordFormSchema>;

export const updateKeywordFormSchema = keywordFormSchema.extend({
  keywordId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateKeywordFormValues = z.output<typeof updateKeywordFormSchema>;

/** A keyword as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function keywordFormValues(row: KeywordRow): FormValues {
  return {
    keywordId: String(row.KeywordId),
    rowVer: String(row.RowVer),
    projectId: formText(row.ProjectId),
    keyword: row.Keyword,
    definition: formText(row.Definition),
  };
}
