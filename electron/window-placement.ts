/**
 * Where a detached window opens (client feedback 2026-10-12: staff work on
 * several screens and move a page onto its own display). Pure, so it is tested
 * without Electron's `screen`.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  bounds: Rect;
  maximized: boolean;
}

const CASCADE = 32;

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** At least half of the window lies on one connected display (not lost after undocking). */
export function isOnScreen(bounds: Rect, workAreas: readonly Rect[]): boolean {
  const area = bounds.width * bounds.height;
  return area > 0 && workAreas.some((work) => overlap(bounds, work) * 2 >= area);
}

/**
 * Where the last detached window was, while that is still on screen; else
 * filling a display other than the main window's; else beside the main window.
 */
export function detachedPlacement({
  saved,
  workAreas,
  mainArea,
  mainBounds,
}: {
  saved: Placement | null | undefined;
  workAreas: readonly Rect[];
  /** Work area of the display the main window is on. */
  mainArea: Rect;
  mainBounds: Rect;
}): Placement {
  if (saved && isOnScreen(saved.bounds, workAreas)) return saved;
  const other = workAreas.find((work) => overlap(work, mainArea) === 0);
  if (other) return { bounds: { ...other }, maximized: true };
  const x = Math.min(mainBounds.x + CASCADE, mainArea.x + mainArea.width - mainBounds.width);
  const y = Math.min(mainBounds.y + CASCADE, mainArea.y + mainArea.height - mainBounds.height);
  return {
    bounds: {
      x: Math.max(mainArea.x, x),
      y: Math.max(mainArea.y, y),
      width: mainBounds.width,
      height: mainBounds.height,
    },
    maximized: false,
  };
}
