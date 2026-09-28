import { execProc } from "@/lib/db";
import {
  projectAssigneeRowSchema,
  setProjectAssigneesInput,
  type ProjectAssigneeRow,
  type SetProjectAssigneesInput,
} from "../schemas/project";

/**
 * ProjectAssignee repository (req 0.3 — one-or-many PMs/Sponsors/BAs per
 * project). Stored procedures only; usp_ProjectAssignee_Set replaces the full
 * assignee set in one transaction with an in-transaction audit row.
 */

export async function listProjectAssignees(
  projectId: number,
  actorUserId: number,
): Promise<ProjectAssigneeRow[]> {
  const rows = await execProc<ProjectAssigneeRow>("usp_ProjectAssignee_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Search: null,
    SortBy: "Role",
    SortDir: "asc",
    Page: 1,
    PageSize: 100,
  });
  // The list proc appends TotalCount ; the row schema strips it.
  return rows.map((r) => projectAssigneeRowSchema.parse(r));
}

export async function setProjectAssignees(
  input: SetProjectAssigneesInput,
  actorUserId: number,
): Promise<ProjectAssigneeRow[]> {
  const parsed = setProjectAssigneesInput.parse(input);
  const rows = await execProc<ProjectAssigneeRow>("usp_ProjectAssignee_Set", {
    ProjectId: parsed.projectId,
    AssigneesJson: JSON.stringify(parsed.assignees),
    ActorUserId: actorUserId,
  });
  return rows.map((r) => projectAssigneeRowSchema.parse(r));
}
