import type { FormValues } from "@/components/ui/data-view/datasheet";
import type { StakeholderOption } from "./repository/stakeholder-options";

/** A stakeholder as the pickers name them: first name, then last name when there is one. */
export function stakeholderOption(row: {
  StakeholderId: number;
  FirstName: string;
  LastName: string | null;
}): StakeholderOption {
  return {
    stakeholderId: row.StakeholderId,
    name: [row.FirstName, row.LastName].filter(Boolean).join(" "),
  };
}

/**
 * A name typed into a picker as the new stakeholder's form values: the first word is the first
 * name and the rest the last name, which the person can correct under Stakeholders.
 */
export function typedNameValues(projectId: number, text: string): FormValues {
  const [firstName = "", ...rest] = text.trim().split(/\s+/);
  return { projectId: String(projectId), firstName, lastName: rest.join(" ") };
}
