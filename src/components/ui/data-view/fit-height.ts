/** A list box never shrinks below this, however little room the window leaves. */
export const MIN_BOX_PX = 240;

/** One ancestor of the box: where its content may end, and where its in-flow children do end. */
export interface FitLevel {
  contentBottom: number;
  childrenBottom: number | null;
}

/**
 * The empty room stretched ancestors add below the box. The shell is a full-window flex column,
 * so a page shorter than the window is padded out below its content; that room is not content,
 * and counting it as such capped a short list's box at its own height for good, so the box stayed
 * short when the list grew back (a filter cleared).
 */
export function stretchBelow(levels: readonly FitLevel[]): number {
  let room = 0;
  for (const level of levels) {
    if (level.childrenBottom === null) continue;
    room += Math.max(level.contentBottom - level.childrenBottom, 0);
  }
  return room;
}

/**
 * The height that fills the window between what sits above the box and what sits below it, so
 * the page itself does not scroll as well (client feedback, 2026-10-28). `top` is the box's top
 * in the page, `below` everything from its bottom to the page's end, stretch included.
 */
export function fitHeight({
  viewport,
  top,
  below,
  stretch,
}: {
  viewport: number;
  top: number;
  below: number;
  stretch: number;
}): number {
  return Math.max(viewport - top - (below - stretch), MIN_BOX_PX);
}
