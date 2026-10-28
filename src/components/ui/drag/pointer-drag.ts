/**
 * Pointer-drag primitives (ADR-0038), shared by the board's column and card drag. Pure and
 * DOM-free (ADR-0013), so Vitest covers them; the client hook that turns pointer events into these
 * calls lands with the board view that uses it.
 *
 * `edgeScroll` matches src/modules/key-deliverables/components/wbs-diagram-layout.ts exactly, so the
 * WBS diagram can later point at this one copy with no behaviour change (plan Part 2). `dropZoneAt`
 * stays with the WBS — it drops a box into a tree (before / into / after a node), while a board
 * drops an item between others in a list, which is what `insertionIndex` answers.
 */

/** How far a pointer must travel after pressing before a press becomes a drag, in pixels. */
export const DRAG_SLOP = 5;

/** The fastest a scroll container moves while the pointer is near its edge, in pixels per frame. */
export const MAX_EDGE_SCROLL = 20;

/** Whether a press that has moved (dx, dy) has travelled far enough to count as a drag, not a click. */
export function exceedsSlop(dx: number, dy: number, slop: number = DRAG_SLOP): boolean {
  return dx * dx + dy * dy >= slop * slop;
}

/**
 * How far to scroll a container this frame while the pointer sits near (or past) an edge: negative
 * toward the start, positive toward the end, 0 in the middle. `start` and `end` are the container's
 * bounds on the scroll axis (e.g. a rect's left/right or top/bottom).
 */
export function edgeScroll(
  pointer: number,
  start: number,
  end: number,
  margin: number = 40,
): number {
  if (pointer < start + margin) {
    return -Math.min(MAX_EDGE_SCROLL, Math.ceil((start + margin - pointer) / 4));
  }
  if (pointer > end - margin) {
    return Math.min(MAX_EDGE_SCROLL, Math.ceil((pointer - (end - margin)) / 4));
  }
  return 0;
}

/** One item's extent along the drag axis, e.g. a card's getBoundingClientRect `top`/`height`. */
export interface DragSpan {
  start: number;
  size: number;
}

/**
 * The index a dragged item should land at in a list laid out along one axis: the first item whose
 * midpoint is past `pointer`, or the list length when the pointer is past them all. The result is
 * always 0..spans.length, so it names a gap between items, never an item. Spans are taken in the
 * order the items appear.
 */
export function insertionIndex(pointer: number, spans: readonly DragSpan[]): number {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span && pointer < span.start + span.size / 2) return i;
  }
  return spans.length;
}
