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
 * The stakeholder picker's source (ADR-0001: other modules may use it): the
 * project's stakeholders by name via usp_Stakeholder_List, which checks the
 * actor's access to the project. Key deliverables' Assigned-to uses it.
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
