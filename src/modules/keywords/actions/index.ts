"use server";

import { action } from "@/lib/action";
import { createKeyword, deleteKeyword, updateKeyword } from "../repository/keywords";
import { keywordFormSchema, updateKeywordFormSchema } from "../schemas/keyword-form";
import { deleteKeywordInput } from "../schemas/keyword";

/**
 * Create a keyword (RBAC keywords:create — project level checked in-proc, ADR-0021; audited in-proc).
 * The keywords page is dynamic (session cookie) and the sheet calls
 * router.refresh() on success — no static path to revalidate (ADR-0018
 * project-scoped route).
 */
export const createKeywordAction = action({
  name: "keywords.create",
  schema: keywordFormSchema,
  permission: "keywords:create",
  handler: (input, ctx) => createKeyword(input, ctx.session.userId),
});

/** Update an keyword (RBAC keywords:update — project level checked in-proc, ADR-0021; audited in-proc). */
export const updateKeywordAction = action({
  name: "keywords.update",
  schema: updateKeywordFormSchema,
  permission: "keywords:update",
  handler: (input, ctx) => updateKeyword(input, ctx.session.userId),
});

/** Soft-delete a keyword (RBAC keywords:delete — project level checked in-proc, ADR-0021; audited in-proc). */
export const deleteKeywordAction = action({
  name: "keywords.delete",
  schema: deleteKeywordInput,
  permission: "keywords:delete",
  handler: async (input, ctx) => {
    await deleteKeyword(input.keywordId, input.rowVer, ctx.session.userId);
    return { keywordId: input.keywordId };
  },
});
