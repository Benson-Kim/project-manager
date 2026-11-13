"use client";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../motion/use-flip";
import { edgeScroll, exceedsSlop, insertionIndex } from "./pointer-drag";

export interface ListDrop {
  itemId: number;
  lane: string;
  beforeId?: number;
}

/** The direction a list runs: a column of cards is "y", a row of headings is "x". */
export type DragAxis = "x" | "y";

/** How long the lifted copy takes to settle into the spot it was dropped on. */
export const DROP_MS = 180;

function sameDrop(a: ListDrop | null, b: ListDrop | null): boolean {
  return a?.itemId === b?.itemId && a?.lane === b?.lane && a?.beforeId === b?.beforeId;
}

/** The lane and the gap under the pointer; the dragged item itself is not a gap. */
function dropAt(x: number, y: number, itemId: number, axis: DragAxis): ListDrop | null {
  const lane = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drag-lane]");
  if (!lane?.dataset.dragLane) return null;
  const items = [...lane.querySelectorAll<HTMLElement>("[data-drag-item]")].filter(
    (item) => Number(item.dataset.dragItem) !== itemId,
  );
  const index = insertionIndex(
    axis === "x" ? x : y,
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return axis === "x"
        ? { start: box.left, size: box.width }
        : { start: box.top, size: box.height };
    }),
  );
  const before = items[index];
  return {
    itemId,
    lane: lane.dataset.dragLane,
    beforeId: before ? Number(before.dataset.dragItem) : undefined,
  };
}

/** The lifted copy reads as a ghost: see-through, its left and right edges faded out. */
const GHOST_MASK = "linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)";

/** A copy of the item that follows the pointer; it is decoration, so it is hidden from everyone. */
function liftCopy(item: HTMLElement): HTMLElement {
  const box = item.getBoundingClientRect();
  const copy = item.cloneNode(true) as HTMLElement;
  for (const el of [
    copy,
    ...copy.querySelectorAll<HTMLElement>("[id], [data-drag-item], [data-testid]"),
  ]) {
    el.removeAttribute("id");
    el.removeAttribute("data-drag-item");
    el.removeAttribute("data-testid");
  }
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  Object.assign(copy.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    opacity: "0.7",
    maskImage: GHOST_MASK,
  });
  document.body.append(copy);
  return copy;
}

/** The copy glides onto the item's new place, then goes; with reduced motion, or no place, it just goes. */
function settle(copy: HTMLElement, find: () => HTMLElement | null) {
  requestAnimationFrame(() => {
    const target = find();
    if (!target || prefersReducedMotion()) {
      copy.remove();
      return;
    }
    const to = target.getBoundingClientRect();
    const dx = to.left - parseFloat(copy.style.left);
    const dy = to.top - parseFloat(copy.style.top);
    const animation = copy.animate(
      [{ translate: copy.style.translate || "0px 0px" }, { translate: `${dx}px ${dy}px` }],
      { duration: DROP_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    );
    animation.onfinish = animation.oncancel = () => copy.remove();
  });
}

/** Presses here keep their own behaviour (typing, selecting, following a link) and never drag. */
const NO_DRAG = "input, textarea, select, a[href], [contenteditable='true'], [role='menu']";

/** The click that ends a drag lands on whatever is under the pointer; it must not open it. */
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

export interface DragGesture<Id extends string | number, Drop> {
  /** The item being dragged, once the press has moved far enough to count as a drag. */
  dragging: Id | null;
  /** What would take the item if it were let go now. */
  over: Drop | null;
  bind: (id: Id) => { onPointerDown: (event: React.PointerEvent<HTMLElement>) => void };
}

export interface DragGestureOptions<Id extends string | number, Drop> {
  enabled: boolean;
  /** What would take the item if it were let go at (x, y); `previous` is the last answer. */
  locate: (x: number, y: number, id: Id, previous: Drop | null) => Drop | null;
  /** Whether two answers look the same, so the caller re-renders only when the answer changes. */
  same: (a: Drop | null, b: Drop | null) => boolean;
  onDrop: (id: Id, drop: Drop) => void;
  /** The dropped item in its new place, for the copy to glide onto. */
  landing?: (id: Id, container: HTMLElement | null) => HTMLElement | null;
}

/**
 * Pointer drag for mouse, pen and touch; explicit controls (move buttons, a click to add) remain the
 * keyboard path. A mouse or pen drags the item from anywhere on it, and a press that does not move
 * stays a click; touch drags only from the item's `[data-drag-handle]`, so the page still scrolls
 * under a finger. A see-through copy follows the pointer and `locate` names what is under it; on
 * release `onDrop` gets the last answer and the copy settles. The window, not the item, follows the
 * gesture, so the item may be remounted while it moves. Escape cancels.
 */
export function useDragGesture<Id extends string | number, Drop>(
  options: DragGestureOptions<Id, Drop>,
): DragGesture<Id, Drop> {
  const [dragging, setDragging] = useState<Id | null>(null);
  const [over, setOver] = useState<Drop | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const session = useRef<{
    id: Id;
    item: HTMLElement;
    container: HTMLElement | null;
    copy: HTMLElement | null;
    over: Drop | null;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
    stop: () => void;
  } | null>(null);
  const frame = useRef(0);
  const follow = () => {
    const state = session.current;
    if (!state?.moved) return;
    const { locate, same } = optionsRef.current;
    const at = locate(state.x, state.y, state.id, state.over);
    const changed = !same(at, state.over);
    state.over = at;
    if (changed) setOver(at);
    const lane = document
      .elementFromPoint(state.x, state.y)
      ?.closest<HTMLElement>("[data-drag-lane]");
    const container = lane?.closest<HTMLElement>("[data-drag-container]");
    if (container) {
      const box = container.getBoundingClientRect();
      container.scrollLeft += edgeScroll(state.x, box.left, box.right);
    }
    window.scrollBy(0, edgeScroll(state.y, 0, window.innerHeight));
    frame.current = requestAnimationFrame(follow);
  };
  const end = (drop: boolean) => {
    const state = session.current;
    if (!state) return;
    cancelAnimationFrame(frame.current);
    state.stop();
    session.current = null;
    if (state.moved) {
      document.documentElement.style.removeProperty("cursor");
      if (drop) swallowNextClick();
    }
    const landed = drop && state.moved && state.over !== null;
    if (landed) optionsRef.current.onDrop(state.id, state.over as Drop);
    if (state.copy) {
      const { copy, container, id } = state;
      const { landing } = optionsRef.current;
      if (landed) settle(copy, () => landing?.(id, container) ?? null);
      else copy.remove();
    }
    setDragging(null);
    setOver(null);
  };
  const endRef = useRef(end);
  useEffect(() => {
    endRef.current = end;
  });
  useEffect(() => () => endRef.current(false), []);
  return {
    dragging,
    over,
    bind: (id: Id) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (!options.enabled || !event.isPrimary || event.button !== 0 || session.current) return;
        const target = event.target as Element;
        if (target.closest(NO_DRAG)) return;
        if (event.pointerType === "touch" && !target.closest("[data-drag-handle]")) return;
        const held = event.currentTarget;
        const item = held.closest<HTMLElement>("[data-drag-item]") ?? held;
        const move = (e: PointerEvent) => {
          const state = session.current;
          if (!state || state.pointerId !== e.pointerId) return;
          state.x = e.clientX;
          state.y = e.clientY;
          if (!state.moved && exceedsSlop(state.x - state.startX, state.y - state.startY)) {
            state.moved = true;
            // Captured only now: a capture from the press would take a plain click off its button.
            if (held.isConnected) held.setPointerCapture(e.pointerId);
            window.getSelection()?.removeAllRanges();
            document.documentElement.style.cursor = "grabbing";
            state.copy = liftCopy(state.item);
            setDragging(id);
            follow();
          }
          if (state.copy) {
            state.copy.style.translate = `${state.x - state.startX}px ${state.y - state.startY}px`;
          }
        };
        const up = (e: PointerEvent) => {
          if (session.current?.pointerId === e.pointerId) endRef.current(true);
        };
        const cancel = (e: PointerEvent) => {
          if (session.current?.pointerId === e.pointerId) endRef.current(false);
        };
        const key = (e: KeyboardEvent) => {
          if (e.key === "Escape" && session.current) {
            e.preventDefault();
            endRef.current(false);
          }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("keydown", key);
        session.current = {
          id,
          item,
          container: item.closest<HTMLElement>("[data-drag-container]"),
          copy: null,
          over: null,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          pointerId: event.pointerId,
          stop: () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", key);
          },
        };
      },
    }),
  };
}

/**
 * Reordering a list by pointer: `over` is the gap under the pointer, so the caller can show the item
 * there while its neighbours make room, and the copy settles onto the item's new place on release.
 * Lanes are `[data-drag-lane]`, their items `[data-drag-item]`, measured along `axis`.
 */
export function usePointerDrag({
  enabled,
  axis = "y",
  onDrop,
}: {
  enabled: boolean;
  axis?: DragAxis;
  onDrop: (drop: ListDrop) => void;
}): DragGesture<number, ListDrop> {
  return useDragGesture<number, ListDrop>({
    enabled,
    locate: (x, y, itemId, previous) => dropAt(x, y, itemId, axis) ?? previous,
    same: sameDrop,
    onDrop: (_, drop) => onDrop(drop),
    landing: (itemId, container) =>
      container?.querySelector<HTMLElement>(`[data-drag-item="${itemId}"]`) ?? null,
  });
}
