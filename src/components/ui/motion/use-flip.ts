"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const FLIP_ID = "flip";

export interface Spot {
  x: number;
  y: number;
}

/** How far each element that stayed on screen moved, at least a pixel either way. */
export function flipDeltas(
  before: ReadonlyMap<string, Spot>,
  now: ReadonlyMap<string, Spot>,
): { id: string; dx: number; dy: number }[] {
  const moved: { id: string; dx: number; dy: number }[] = [];
  for (const [id, at] of now) {
    const was = before.get(id);
    if (!was) continue;
    const dx = was.x - at.x;
    const dy = was.y - at.y;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moved.push({ id, dx, dy });
  }
  return moved;
}

/** Positions inside the container's content, so scrolling it between two changes is not a move. */
function spots(container: HTMLElement, attribute: string, zoom: number): Map<string, Spot> {
  const origin = container.getBoundingClientRect();
  const found = new Map<string, Spot>();
  for (const el of container.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const rect = el.getBoundingClientRect();
    found.set(el.getAttribute(attribute)!, {
      x: (rect.left - origin.left + container.scrollLeft) / zoom,
      y: (rect.top - origin.top + container.scrollTop) / zoom,
    });
  }
  return found;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface FlipOptions {
  /** The attribute naming each moving element, e.g. "data-wbs-box"; its value is the element's id. */
  attribute: string;
  duration: number;
  zoom?: number;
}

/**
 * When `key` changes, the elements glide from where they were to where the change put them
 * (measure, let the layout move, animate the difference away) instead of jumping. Re-layouts that
 * keep the key (zoom, width) still jump.
 */
export function useFlip(
  containerRef: RefObject<HTMLElement | null>,
  key: string,
  { attribute, duration, zoom = 1 }: FlipOptions,
) {
  const last = useRef<{ key: string; spots: Map<string, Spot> } | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = last.current;
    if (previous === null || previous.key === key) {
      last.current = { key, spots: spots(container, attribute, zoom) };
      return;
    }
    for (const animation of container.getAnimations({ subtree: true })) {
      if (animation.id === FLIP_ID) animation.cancel();
    }
    const now = spots(container, attribute, zoom);
    last.current = { key, spots: now };
    if (prefersReducedMotion()) return;
    for (const { id, dx, dy } of flipDeltas(previous.spots, now)) {
      const el = container.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(id)}"]`);
      el?.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        id: FLIP_ID,
        duration,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  });
}
