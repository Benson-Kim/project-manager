import { listStakeholderOptions } from "@/modules/stakeholders/repository/stakeholder-options";

/**
 * Stakeholder names for the project team editor (req 0.3): every one of the
 * project's stakeholders, read as the stakeholder pickers read them. They can
 * be listed in the team without an account and gain no access (ADR-0021); user
 * accounts come from listUserOptions.
 */
export async function listAssigneeOptions(
  projectId: number,
  actorUserId: number,
): Promise<string[]> {
  const options = await listStakeholderOptions(projectId, actorUserId);
  return [...new Set(options.map((option) => option.name))];
}
