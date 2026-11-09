import { dropStep, pushStep, takeStep } from "@/lib/undo-stack";
import { descendantIds, fitsUnder, type Placement, type Wbs } from "./wbs";

export { UNDO_LIMIT } from "@/lib/undo-stack";

/** What puts an item back: its place, or its dates, before a move or a reschedule. */
export type UndoStep =
  | { key: number; kind: "move"; id: number; placement: Placement }
  | { key: number; kind: "reschedule"; id: number; start: Date; end: Date };

/** The step back to where the item is now, before it goes `to`; null when that changes nothing. */
export function moveBack(wbs: Wbs, id: number, to: Placement, key: number): UndoStep | null {
  const node = wbs.nodes.get(id);
  if (!node) return null;
  const here = node.index + 1;
  // The move clamps a position past the end to the last place, as usp_KeyDeliverable_Move does.
  const stays =
    to.parentId === node.parentId && Math.min(Math.max(to.position, 1), node.siblingCount) === here;
  return stays
    ? null
    : { key, kind: "move", id, placement: { parentId: node.parentId, position: here } };
}

/** The step back to the item's dates now (rolled up for a parent); null when it has none. */
export function rescheduleBack(wbs: Wbs, id: number, key: number): UndoStep | null {
  const node = wbs.nodes.get(id);
  if (!node?.start || !node.end) return null;
  return { key, kind: "reschedule", id, start: node.start, end: node.end };
}

export const pushUndo = pushStep<UndoStep>;
export const dropUndo = dropStep<UndoStep>;

/**
 * A step still applies while its item is on the plan and, for a move, its old parent can take it
 * back: still there, not inside the item's own branch, not a milestone, and not too deep.
 */
function applies(wbs: Wbs, step: UndoStep): boolean {
  if (!wbs.nodes.has(step.id)) return false;
  if (step.kind === "reschedule") return true;
  const { parentId } = step.placement;
  if (parentId === null) return true;
  const parent = wbs.nodes.get(parentId);
  return (
    parent !== undefined &&
    parentId !== step.id &&
    !parent.item.isMilestone &&
    !descendantIds(wbs, step.id).includes(parentId) &&
    fitsUnder(wbs, step.id, parentId)
  );
}

export function canUndo(stack: readonly UndoStep[], wbs: Wbs): boolean {
  return stack.some((step) => applies(wbs, step));
}

export function takeUndo(stack: readonly UndoStep[], wbs: Wbs) {
  return takeStep(stack, (step) => applies(wbs, step));
}
