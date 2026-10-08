import { z } from "zod";
import { actorAccessSchema } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Keywords — zod contracts. Row schema mirrors
 * the SELECT shape of usp_Keyword_{Create,GetById,List,Update}.
 */

export const keywordRowSchema = z.object({
  KeywordId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  Keyword: z.string(),
  Definition: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
});

export type KeywordRow = z.infer<typeof keywordRowSchema>;

export const keywordListRowSchema = keywordRowSchema.extend({
  TotalCount: z.number().int(),
  ActorAccess: actorAccessSchema,
});

export type KeywordListRow = z.infer<typeof keywordListRowSchema>;

export const createKeywordInput = z.object({
  projectId: z.number().int().positive().nullable(),
  keyword: z.string().trim().min(1).max(255),
  definition: z.string().trim().max(255).nullish(),
});

export type CreateKeywordInput = z.input<typeof createKeywordInput>;
export type CreateKeywordParsed = z.infer<typeof createKeywordInput>;

export const updateKeywordInput = createKeywordInput.extend({
  keywordId: z.number().int().positive(),
  rowVer: rowVerSchema,
});

export type UpdateKeywordInput = z.input<typeof updateKeywordInput>;

export const deleteKeywordInput = z.object({
  keywordId: z.coerce.number().int().positive(),
  rowVer: rowVerSchema,
});

export type DeleteKeywordInput = z.input<typeof deleteKeywordInput>;
