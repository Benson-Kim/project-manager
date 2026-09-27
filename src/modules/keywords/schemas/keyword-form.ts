import { z } from "zod";
import { messages } from "@/lib/messages";

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
  projectId: z.coerce.number().int().nullable(),
  keyword: z.string().trim().min(1, messages.keywords.keywordRequired).max(255),
  definition: optionalText(255),
});

export type KeywordFormValues = z.output<typeof keywordFormSchema>;

export const updateKeywordFormSchema = keywordFormSchema.extend({
  keywordId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateKeywordFormValues = z.output<typeof updateKeywordFormSchema>;
