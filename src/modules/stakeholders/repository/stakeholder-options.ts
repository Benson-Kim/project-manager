import { z } from "zod";
import { execProc } from "@/lib/db";
import { stakeholderOption } from "../names";

const optionRowSchema = z.object({
  StakeholderId: z.number().int(),
  FirstName: z.string(),
  LastName: z.string().nullable(),
});

/** usp_Stakeholder_List returns at most 100 rows a page. */
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export interface StakeholderOption {
  stakeholderId: number;
  name: string;
}

/**
 * The stakeholder picker's source (ADR-0001: other modules may use it): the
 * project's stakeholders by name via usp_Stakeholder_List, which checks the
 * actor's access to the project, read page by page so none is left out.
 * Key deliverables' Assigned-to uses it.
 */
export async function listStakeholderOptions(
  projectId: number,
  actorUserId: number,
): Promise<StakeholderOption[]> {
  const options: StakeholderOption[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await execProc("usp_Stakeholder_List", {
      ActorUserId: actorUserId,
      ProjectId: projectId,
      Search: null,
      SortBy: "LastName",
      SortDir: "asc",
      Page: page,
      PageSize: PAGE_SIZE,
    });
    for (const r of rows) options.push(stakeholderOption(optionRowSchema.parse(r)));
    if (rows.length < PAGE_SIZE) break;
  }
  return options;
}
