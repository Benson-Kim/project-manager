"use client";
import { useEffect, useRef, useState } from "react";
import { edgeScroll, exceedsSlop, insertionIndex } from "./pointer-drag";

export interface ListDrop {
  itemId: number;
  lane: string;
  beforeId?: number;
}
/** Pointer capture works for mouse, pen and touch; explicit move controls remain the keyboard path. */
export function usePointerDrag({
  enabled,
  onDrop,
}: {
  enabled: boolean;
  onDrop: (drop: ListDrop) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const session = useRef<{
    itemId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const frame = useRef(0);
  const scroll = () => {
    const state = session.current;
    if (!state?.moved) return;
    const lane = document
      .elementFromPoint(state.x, state.y)
      ?.closest<HTMLElement>("[data-drag-lane]");
    const container = lane?.closest<HTMLElement>("[data-drag-container]");
    if (container) {
      const box = container.getBoundingClientRect();
      container.scrollLeft += edgeScroll(state.x, box.left, box.right);
    }
    window.scrollBy(0, edgeScroll(state.y, 0, window.innerHeight));
    frame.current = requestAnimationFrame(scroll);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const reset = () => {
    cancelAnimationFrame(frame.current);
    session.current = null;
    setDragging(null);
  };
  return {
    dragging,
    bind: (itemId: number) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (!enabled || !event.isPrimary || event.button !== 0) return;
        session.current = {
          itemId,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const state = session.current;
        if (!state || state.pointerId !== event.pointerId) return;
        state.x = event.clientX;
        state.y = event.clientY;
        if (!state.moved && exceedsSlop(state.x - state.startX, state.y - state.startY)) {
          state.moved = true;
          setDragging(itemId);
          scroll();
        }
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        const state = session.current;
        if (!state || state.pointerId !== event.pointerId) return;
        if (state.moved) {
          const lane = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-drag-lane]");
          if (lane?.dataset.dragLane) {
            const items = [...lane.querySelectorAll<HTMLElement>("[data-drag-item]")].filter(
              (item) => Number(item.dataset.dragItem) !== itemId,
            );
            const index = insertionIndex(
              event.clientY,
              items.map((item) => {
                const box = item.getBoundingClientRect();
                return { start: box.top, size: box.height };
              }),
            );
            const before = items[index];
            onDrop({
              itemId,
              lane: lane.dataset.dragLane,
              beforeId: before ? Number(before.dataset.dragItem) : undefined,
            });
          }
        }
        reset();
      },
      onPointerCancel: reset,
      onLostPointerCapture: reset,
    }),
  };
}
