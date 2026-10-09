"use server";

import { action } from "@/lib/action";
import { saveLookupListInput } from "@/lib/lookup-lists";
import { saveLookupList } from "../repository/lookup-lists";

/**
 * Save one dropdown list from the datasheet's "Edit dropdown list" dialog
 * (ADR-0022/0023). Admin only: the lists are shared by every project, so the
 * global gate is `admin:*` and dbo.usp_LookupList_Set checks the role again.
 * No revalidate targets: the dialog updates the open page's options from the
 * returned list at once and refreshes the route so renamed record values show.
 */
export const saveLookupListAction = action({
  name: "lookup-lists.save",
  schema: saveLookupListInput,
  permission: "admin:lookup-lists",
  handler: (input, ctx) => saveLookupList(input, ctx.session.userId),
});
