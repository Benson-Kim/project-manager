import { z } from "zod";
import { execProc } from "@/lib/db";

const optionRowSchema = z.object({
  StakeholderId: z.number().int(),
  FirstName: z.string(),
  LastName: z.string().nullable(),
});

export interface StakeholderOption {
  stakeholderId: number;
  name: string;
}

/**
 * Combobox source for the Assigned-to field (issue #9): the project's
 * stakeholders via usp_Stakeholder_List (project-scoped, proc reuse only —
 * no dependency on the stakeholders module branch).
 */
export async function listStakeholderOptions(
  projectId: number,
  actorUserId: number,
): Promise<StakeholderOption[]> {
  const rows = await execProc("usp_Stakeholder_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    Search: null,
    SortBy: "LastName",
    SortDir: "asc",
    Page: 1,
    PageSize: 100,
  });
  return rows.map((r) => {
    const parsed = optionRowSchema.parse(r);
    return {
      stakeholderId: parsed.StakeholderId,
      name: [parsed.FirstName, parsed.LastName].filter(Boolean).join(" "),
    };
  });
}
