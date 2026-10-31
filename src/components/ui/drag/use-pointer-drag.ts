"use client";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../motion/use-flip";
import { edgeScroll, exceedsSlop, insertionIndex } from "./pointer-drag";

export interface ListDrop {
  itemId: number;
  lane: string;
  beforeId?: number;
}

/** How long the lifted copy takes to settle into the spot it was dropped on. */
export const DROP_MS = 180;

function sameDrop(a: ListDrop | null, b: ListDrop | null): boolean {
  return a?.itemId === b?.itemId && a?.lane === b?.lane && a?.beforeId === b?.beforeId;
}

/** The lane and the gap under the pointer; the dragged item itself is not a gap. */
function dropAt(x: number, y: number, itemId: number): ListDrop | null {
  const lane = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drag-lane]");
  if (!lane?.dataset.dragLane) return null;
  const items = [...lane.querySelectorAll<HTMLElement>("[data-drag-item]")].filter(
    (item) => Number(item.dataset.dragItem) !== itemId,
  );
  const index = insertionIndex(
    y,
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { start: box.top, size: box.height };
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
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("[id], [data-drag-item]")]) {
    el.removeAttribute("id");
    el.removeAttribute("data-drag-item");
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

/** The copy glides onto the item's new place, then goes; with reduced motion it just goes. */
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

/**
 * Pointer drag for mouse, pen and touch; explicit move controls remain the keyboard path. A mouse
 * or pen drags the item from anywhere on it, and a press that does not move stays a click; touch
 * drags only from the item's `[data-drag-handle]`, so the page still scrolls under a finger. While
 * dragging, `over` is the gap under the pointer, so the caller can show the item there and its
 * neighbours make room. The window, not the item, follows the gesture: the item is remounted when
 * the caller moves it to another lane. Escape cancels.
 */
export function usePointerDrag({
  enabled,
  onDrop,
}: {
  enabled: boolean;
  onDrop: (drop: ListDrop) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<ListDrop | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });
  const session = useRef<{
    itemId: number;
    item: HTMLElement | null;
    container: HTMLElement | null;
    copy: HTMLElement | null;
    over: ListDrop | null;
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
    const at = dropAt(state.x, state.y, state.itemId);
    if (at && !sameDrop(at, state.over)) {
      state.over = at;
      setOver(at);
    }
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
    if (drop && state.moved && state.over) dropRef.current(state.over);
    if (state.copy) {
      const { copy, container, itemId } = state;
      if (drop && state.over) {
        settle(copy, () => container?.querySelector(`[data-drag-item="${itemId}"]`) ?? null);
      } else copy.remove();
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
    bind: (itemId: number) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (!enabled || !event.isPrimary || event.button !== 0 || session.current) return;
        const target = event.target as Element;
        if (target.closest(NO_DRAG)) return;
        if (event.pointerType === "touch" && !target.closest("[data-drag-handle]")) return;
        const item = event.currentTarget.closest<HTMLElement>("[data-drag-item]");
        const held = event.currentTarget;
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
            state.copy = state.item ? liftCopy(state.item) : null;
            setDragging(itemId);
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
          itemId,
          item,
          container: item?.closest<HTMLElement>("[data-drag-container]") ?? null,
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
