"use server";

import { action } from "@/lib/action";
import { searchGlobal } from "../repository/search";
import { globalSearchInput } from "../schemas/search";

/**
 * Search across all active projects the actor can read (RBAC projects:read — row-level
 * access and soft-delete filtering enforced in dbo.usp_Search_Global). Keeps working
 * while the licence is inactive (licence: "read", ADR-0068).
 */
export const searchGlobalAction = action({
  name: "search.global",
  schema: globalSearchInput,
  permission: "projects:read",
  licence: "read",
  handler: (input, ctx) => searchGlobal(input, ctx.session.userId),
});
