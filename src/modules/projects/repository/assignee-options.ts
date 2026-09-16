import { z } from "zod";
import { execProc } from "@/lib/db";

const nameRowSchema = z.object({
  FirstName: z.string(),
  LastName: z.string().nullable(),
});

/**
 * Combobox source for the Assignees section (req 0.3): the project's
 * stakeholders (usp_Stakeholder_List, project-scoped). Auth users are an
 * admin-module resource (RBAC) — stakeholders are the shared people registry.
 */
export async function listAssigneeOptions(
  projectId: number,
  actorUserId: number,
): Promise<string[]> {
  const rows = await execProc("usp_Stakeholder_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Search: null,
    SortBy: "LastName",
    SortDir: "asc",
    Page: 1,
    PageSize: 100,
  });
  const names = rows.map((r) => {
    const parsed = nameRowSchema.parse(r);
    return [parsed.FirstName, parsed.LastName].filter(Boolean).join(" ");
  });
  return [...new Set(names)];
}
