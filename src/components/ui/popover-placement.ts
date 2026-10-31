"use client";

import { useLayoutEffect } from "react";

const GAP_PX = 8;
const OFFSET_PX = 4;
const EDGE_PX = 8;
const MIN_PANEL_PX = 96;

interface Span {
  top: number;
  bottom: number;
}

/** Where a panel lines up with its anchor: left edges, right edges, or the anchor's width. */
export type PanelAlign = "start" | "end" | "stretch";

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

/** How far to move a panel sideways so it sits inside the window, EDGE_PX from each side. */
export function shiftIntoView(left: number, right: number, windowWidth: number): number {
  if (right > windowWidth - EDGE_PX) return Math.max(windowWidth - EDGE_PX - right, EDGE_PX - left);
  if (left < EDGE_PX) return EDGE_PX - left;
  return 0;
}

/** The panel's left edge in the window: on the anchor's left edge, or its right edge on the anchor's, kept inside the window. */
export function panelLeft(
  anchor: { left: number; right: number },
  width: number,
  align: PanelAlign,
  windowWidth: number,
): number {
  const left = align === "end" ? anchor.right - width : anchor.left;
  return left + shiftIntoView(left, left + width, windowWidth);
}

/** The panel's top edge in the window: just under the anchor, or just above it when it opens up. */
export function panelTop(anchor: Span, height: number, up: boolean): number {
  return up ? anchor.top - OFFSET_PX - height : anchor.bottom + OFFSET_PX;
}

/**
 * Places a dropdown panel (`position: fixed`) against its anchor in the window, so no scrolling
 * form, sheet or dialog it sits in can cut it off or squeeze it: under the anchor, or above it when
 * it would be cut off below and above has more room. Measured before paint each time it opens, and
 * again when anything around it scrolls or the window resizes. With `fit`, the panel's height is
 * capped to the room on its side, for a scrolling list; a menu keeps its own height.
 */
export function usePopoverPlacement(
  anchorRef: React.RefObject<HTMLElement | null>,
  panelRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  {
    fit = false,
    maxHeight = 240,
    align = "stretch",
    contentKey,
  }: {
    fit?: boolean;
    maxHeight?: number;
    align?: PanelAlign;
    /** Changes when the panel's content does, so it is measured again. */
    contentKey?: unknown;
  } = {},
): void {
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const page = document.documentElement;
      const bounds = { top: 0, bottom: page.clientHeight };
      panel.style.top = "0px";
      panel.style.left = "0px";
      if (align === "stretch") panel.style.width = `${box.width}px`;
      if (fit) panel.style.maxHeight = "";
      // A transformed ancestor (a centred dialog) holds fixed boxes, so offsets start at its corner.
      const origin = panel.getBoundingClientRect();
      const height = fit ? Math.min(panel.scrollHeight, maxHeight) : panel.offsetHeight;
      const up = opensUp(box, height, bounds);
      if (fit) panel.style.maxHeight = `${Math.min(maxHeight, roomFor(up, box, bounds))}px`;
      const top = panelTop(box, panel.offsetHeight, up);
      const left = panelLeft(box, panel.offsetWidth, align, page.clientWidth);
      panel.style.top = `${top - origin.top}px`;
      panel.style.left = `${left - origin.left}px`;
    };
    place();
    // The list's own scrolling leaves it where it is.
    const onScroll = (event: Event) => {
      if (!panel.contains(event.target as Node)) place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, panelRef, open, fit, maxHeight, align, contentKey]);
}
