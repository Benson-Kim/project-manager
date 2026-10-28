"use client";

import { useLayoutEffect, useState } from "react";

const GAP_PX = 8;
const MIN_PANEL_PX = 96;

interface Span {
  top: number;
  bottom: number;
}

/** Whether a panel opens above its anchor: it does not fit below, and above has more room. */
export function opensUp(anchor: Span, panelHeight: number, bounds: Span): boolean {
  const below = bounds.bottom - anchor.bottom - GAP_PX;
  const above = anchor.top - bounds.top - GAP_PX;
  return panelHeight > below && above > below;
}

/** The room left for the panel on the side it opens to, never under MIN_PANEL_PX. */
export function roomFor(up: boolean, anchor: Span, bounds: Span): number {
  const room = up ? anchor.top - bounds.top : bounds.bottom - anchor.bottom;
  return Math.max(room - GAP_PX, MIN_PANEL_PX);
}

/** The part of the window a panel can show in: the window, cut by every ancestor that clips. */
function visibleSpan(element: HTMLElement): Span {
  let top = 0;
  let bottom = document.documentElement.clientHeight;
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/auto|scroll|hidden|clip/.test(getComputedStyle(node).overflowY)) {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  return { top, bottom };
}

/**
 * Opens a dropdown panel upwards when it would be cut off below and there is more room above,
 * measured before paint each time it opens. With `fit`, the panel's height is also capped to the
 * room on that side, for a scrolling list; a menu keeps its own height.
 */
export function usePopoverPlacement(
  anchorRef: React.RefObject<HTMLElement | null>,
  panelRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  {
    fit = false,
    maxHeight = 240,
    contentKey,
  }: {
    fit?: boolean;
    maxHeight?: number;
    /** Changes when the panel's content does, so it is measured again. */
    contentKey?: unknown;
  } = {},
): boolean {
  const [up, setUp] = useState(false);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    if (fit) panel.style.maxHeight = "";
    const box = anchor.getBoundingClientRect();
    const bounds = visibleSpan(anchor);
    const height = fit ? Math.min(panel.scrollHeight, maxHeight) : panel.offsetHeight;
    const next = opensUp(box, height, bounds);
    if (fit) panel.style.maxHeight = `${Math.min(maxHeight, roomFor(next, box, bounds))}px`;
    setUp(next);
  }, [anchorRef, panelRef, open, fit, maxHeight, contentKey]);

  return open && up;
}
