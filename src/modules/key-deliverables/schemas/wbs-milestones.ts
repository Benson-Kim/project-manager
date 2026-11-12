import { messages } from "@/lib/messages";
import { isOverdue } from "./key-deliverable";
import { DONE_STATUS, utcDay, type Wbs, type WbsItem } from "./wbs";

/**
 * Where a milestone stands. Reached is a fact: somebody recorded the day it happened (migration
 * 055). Until then the calendar decides — overdue once its day has gone by, unless its status
 * already says it is finished or dropped, and upcoming before that. It used to be `date <= today`
 * alone, so a milestone that slipped still read as reached and the strip could never show a slip,
 * which is the whole point of keeping a target date and an actual one side by side.
 */
export type MilestoneState = "reached" | "overdue" | "upcoming";

/** Where a milestone stands in the words the client plans with; Cancelled is shown greyed. */
export type MilestonePhase = "notStarted" | "inProgress" | "blocked" | "done" | "cancelled";

const PHASE_OF = new Map<string, MilestonePhase>([
  ["Pending", "notStarted"],
  ["In Progress", "inProgress"],
  ["On Hold", "blocked"],
  ["Blocked", "blocked"],
  [DONE_STATUS, "done"],
  ["Cancelled", "cancelled"],
]);

/**
 * A deliverable status in milestone words: none set is Not Started. Null for a status an Admin
 * added to the list, which the milestone then shows as it is.
 */
export function milestonePhase(status: string | null): MilestonePhase | null {
  return status === null ? "notStarted" : (PHASE_OF.get(status) ?? null);
}

/** A milestone's status as the client reads it: the milestone word, else the status as it is. */
export function milestoneWords(status: string | null): string {
  const phase = milestonePhase(status);
  return phase ? messages.projects.milestonePhases[phase] : (status ?? "");
}

/** A milestone as the strip above the WBS diagram shows it. */
export interface MilestoneChip {
  id: number;
  code: string;
  name: string;
  /** The day it is aimed at. */
  date: Date | null;
  /** The day it was actually reached, or null while nobody has recorded one. */
  actual: Date | null;
  /** Its status from the deliverable status list; null when none is set. */
  status: string | null;
  /** `status` in milestone words, or null for a status the list does not map. */
  phase: MilestonePhase | null;
  state: MilestoneState;
  /** `state === "reached"`, so the chart reads one flag for its diamond. */
  reached: boolean;
}

/** Overdue is the register's own rule, so the strip and the badges agree on the word. */
function stateOf(item: WbsItem, today: Date): MilestoneState {
  if (item.actualDate !== null) return "reached";
  if (item.start !== null && isOverdue(utcDay(item.start), item.status, utcDay(today)))
    return "overdue";
  return "upcoming";
}

/** The breakdown's milestones by date, the undated last, each in breakdown order among equals. */
export function milestoneStrip(wbs: Wbs, today: Date): MilestoneChip[] {
  const chips = wbs.order
    .map((id) => wbs.nodes.get(id)!)
    .filter((node) => node.item.isMilestone)
    .map((node) => {
      const state = stateOf(node.item, today);
      return {
        id: node.item.id,
        code: node.code,
        name: node.item.name,
        date: node.item.start,
        actual: node.item.actualDate,
        status: node.item.status,
        phase: milestonePhase(node.item.status),
        state,
        reached: state === "reached",
      };
    });
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
