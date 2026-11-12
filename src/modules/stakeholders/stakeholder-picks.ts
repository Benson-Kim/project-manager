import { matchRank, NO_MATCH } from "@/components/ui/form/rank-options";
import type { StakeholderOption } from "./repository/stakeholder-options";

/** A stakeholder picked for a record (a deliverable's assignees). */
export interface PickedStakeholder {
  id: number;
  name: string;
}

/** The stakeholders still to choose from: everyone not picked yet, in the list's order. */
export function unpickedOptions(
  options: readonly StakeholderOption[],
  picked: readonly PickedStakeholder[],
): StakeholderOption[] {
  const ids = new Set(picked.map((p) => p.id));
  return options.filter((o) => !ids.has(o.stakeholderId));
}

/** The picks with this stakeholder added at the end; one already there is not added twice. */
export function withPick(
  picked: readonly PickedStakeholder[],
  option: StakeholderOption,
): PickedStakeholder[] {
  if (picked.some((p) => p.id === option.stakeholderId)) return [...picked];
  return [...picked, { id: option.stakeholderId, name: option.name }];
}

/** The picks without this stakeholder. */
export function withoutPick(picked: readonly PickedStakeholder[], id: number): PickedStakeholder[] {
  return picked.filter((p) => p.id !== id);
}

/** Typed text that names someone already picked, so it is no stranger to offer to add. */
export function namesAPick(picked: readonly PickedStakeholder[], text: string): boolean {
  return text.trim() !== "" && picked.some((p) => matchRank(p.name, text) < NO_MATCH);
}
