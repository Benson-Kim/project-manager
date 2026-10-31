import { dayDiff, type Wbs } from "./wbs";

/** A milestone as the strip above the WBS diagram shows it. */
export interface MilestoneChip {
  id: number;
  code: string;
  name: string;
  date: Date | null;
  /** Its day has come: today or earlier. */
  reached: boolean;
}

/** The breakdown's milestones by date, the undated last, each in breakdown order among equals. */
export function milestoneStrip(wbs: Wbs, today: Date): MilestoneChip[] {
  const chips = wbs.order
    .map((id) => wbs.nodes.get(id)!)
    .filter((node) => node.item.isMilestone)
    .map((node) => ({
      id: node.item.id,
      code: node.code,
      name: node.item.name,
      date: node.item.start,
      reached: node.item.start !== null && dayDiff(node.item.start, today) >= 0,
    }));
  const time = (chip: MilestoneChip) => chip.date?.getTime() ?? Number.POSITIVE_INFINITY;
  return chips.sort((a, b) => time(a) - time(b));
}

/**
 * While the strip shows, the top-level milestones with nothing under them live there alone, so
 * the chart does not draw them again as boxes; nested milestones keep their place in the tree.
 */
export function stripOnlyIds(wbs: Wbs, chips: readonly MilestoneChip[]): Set<number> {
  const inStrip = new Set(chips.map((chip) => chip.id));
  return new Set(
    wbs.rootIds.filter((id) => inStrip.has(id) && wbs.nodes.get(id)!.childIds.length === 0),
  );
}
