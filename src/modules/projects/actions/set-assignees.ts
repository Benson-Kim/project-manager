"use server";

import { action } from "@/lib/action";
import { setProjectAssignees } from "../repository/project-assignees";
import { setProjectAssigneesInput } from "../schemas/project";

/**
 * Replace the full assignee set of a project (req 0.3 one-or-many
 * PMs/Sponsors/BAs) — one transaction + audit in usp_ProjectAssignee_Set.
 * The client submits the whole set as a JSON payload (plain object input).
 */
export const setProjectAssigneesAction = action({
  name: "projects.setAssignees",
  schema: setProjectAssigneesInput,
  permission: "projects:update",
  revalidate: ["/projects"],
  handler: (input, ctx) => setProjectAssignees(input, ctx.session.userId),
});
