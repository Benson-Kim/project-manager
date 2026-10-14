import type { DropZone } from "../schemas/wbs";

/**
 * Geometry for the WBS diagram (ADR-0027 §8): which part of a box a dragged
 * item is over, and the line that joins the project box to the top-level row.
 */

export const WBS_VIEWS = ["wbs", "gantt"] as const;
export type WbsView = (typeof WBS_VIEWS)[number];

export function isWbsView(value: unknown): value is WbsView {
  return typeof value === "string" && (WBS_VIEWS as readonly string[]).includes(value);
}

/**
 * How boxes are laid out where the pointer is: top-level items sit side by
 * side in a row, the levels below are stacked in columns, and the project box
 * only takes items.
 */
export type DropAxis = "row" | "column" | "root";

/** The share of a box, from each edge, that drops in front of it or behind it. */
const EDGE_SHARE = 0.3;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The zone under the pointer: near the leading edge drops in front of the box,
 * near the trailing edge behind it, and the middle makes the dragged item its
 * last sub-item. Leading and trailing are left and right in the top-level row,
 * top and bottom in a column.
 */
export function dropZoneAt(box: Box, x: number, y: number, axis: DropAxis): DropZone {
  if (axis === "root") return "into";
  const share =
    axis === "row"
      ? (x - box.left) / Math.max(box.width, 1)
      : (y - box.top) / Math.max(box.height, 1);
  if (share < EDGE_SHARE) return "before";
  if (share > 1 - EDGE_SHARE) return "after";
  return "into";
}

/** The horizontal line under the project box: from the leftmost to the rightmost drop point. */
export function connectorSpan(xs: readonly number[]): { left: number; width: number } | null {
  if (xs.length < 2) return null;
  const left = Math.min(...xs);
  const width = Math.max(...xs) - left;
  return width > 0 ? { left, width } : null;
}

/** The fastest the diagram scrolls while a box is dragged near its edge, in pixels per frame. */
const MAX_EDGE_SCROLL = 20;

/** Pixels per frame the diagram scrolls by while a box is dragged near (or past) its edge. */
export function edgeScroll(pointer: number, start: number, end: number, margin = 40): number {
  if (pointer < start + margin) {
    return -Math.min(MAX_EDGE_SCROLL, Math.ceil((start + margin - pointer) / 4));
  }
  if (pointer > end - margin) {
    return Math.min(MAX_EDGE_SCROLL, Math.ceil((pointer - (end - margin)) / 4));
  }
  return 0;
}
