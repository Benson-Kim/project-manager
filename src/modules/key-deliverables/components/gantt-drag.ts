import { dropPlacement, type Placement, type Wbs } from "../schemas/wbs";

/** How far the pointer goes before a press on a card's name becomes a drag rather than a click. */
export const DRAG_START_PX = 4;

/** Whole days for a pointer's sideways travel, to the nearest day. */
export function dragDays(pxPerDay: number, dx: number): number {
  const days = Math.round(dx / pxPerDay);
  return days === 0 ? 0 : days;
}

export interface LaneEdge {
  /** The item the lane's cards sit under; null for top-level cards. */
  parentId: number | null;
  top: number;
  bottom: number;
}

/** The lane a pointer's height falls in; undefined between or outside the lanes. */
export function laneAt(lanes: readonly LaneEdge[], y: number): LaneEdge | undefined {
  return lanes.find((lane) => y >= lane.top && y < lane.bottom);
}

/**
 * Where a card dropped on a lane goes: last under the lane's item. Null when it is already there,
 * or the drop would put it inside its own branch or too deep.
 */
export function laneDrop(wbs: Wbs, id: number, parentId: number | null): Placement | null {
  const node = wbs.nodes.get(id);
  if (!node || node.parentId === parentId) return null;
  return dropPlacement(wbs, id, parentId, "into");
}
