"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Placement, Wbs } from "../schemas/wbs";
import { DRAG_START_PX, dragDays, laneAt, laneDrop, type LaneEdge } from "./gantt-drag";
import { shifted, type DragMode, type Span } from "./gantt-span";

/** What a card drag asks the editor to do; absent for viewers. */
export interface GanttDragHandlers {
  /** Shows the dates while dragging; null puts the saved ones back. */
  preview(id: number, span: Span | null): void;
  /** Saves the new dates (through the queue, so Undo takes them back). */
  commit(id: number, span: Span): void;
  move(id: number, placement: Placement): void;
}

interface Drag {
  id: number;
  mode: Exclude<DragMode, "start">;
  pointerId: number;
  x0: number;
  y0: number;
  /** The saved dates when the press began; null for an undated card, which only changes lane. */
  span: Span | null;
  days: number;
  started: boolean;
}

function lanesIn(root: HTMLElement): LaneEdge[] {
  return [...root.querySelectorAll<HTMLElement>("[data-gantt-lane]")].map((el) => {
    const rect = el.getBoundingClientRect();
    const raw = el.dataset.ganttLane;
    return { parentId: raw ? Number(raw) : null, top: rect.top, bottom: rect.bottom };
  });
}

/**
 * Pointer drags on the Gantt's cards: the name moves the dates by whole days and, dropped on
 * another lane, moves the item under that lane's item; the right edge moves the end. Escape
 * cancels. A press that does not travel stays a click.
 */
export function useGanttDrag({
  wbs,
  pxPerDay,
  scrollRef,
  drag,
}: {
  wbs: Wbs;
  pxPerDay: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  drag: GanttDragHandlers | undefined;
}) {
  const state = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  /** The lane the card would move to, as its data-gantt-lane value. */
  const [overLane, setOverLane] = useState<string | null>(null);

  function finish() {
    state.current = null;
    setDragging(null);
    setOverLane(null);
  }

  function cancel() {
    const s = state.current;
    if (s?.started) drag?.preview(s.id, null);
    finish();
  }

  useEffect(() => {
    if (dragging === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function target(y: number): LaneEdge | undefined {
    const s = state.current;
    const root = scrollRef.current;
    if (!s || s.mode !== "move" || !root) return undefined;
    const lane = laneAt(lanesIn(root), y);
    return lane && laneDrop(wbs, s.id, lane.parentId) ? lane : undefined;
  }

  function onPointerDown(event: React.PointerEvent) {
    if (!drag || event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-gantt-handle],[data-gantt-resize]",
    );
    if (!handle) return;
    const resize = handle.dataset.ganttResize !== undefined;
    const id = Number(resize ? handle.dataset.ganttResize : handle.dataset.ganttHandle);
    const node = wbs.nodes.get(id);
    if (!node) return;
    state.current = {
      id,
      mode: resize ? "end" : "move",
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      span: node.start && node.end ? { start: node.start, end: node.end } : null,
      days: 0,
      started: false,
    };
    handle.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const s = state.current;
    if (!s || !drag || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.x0;
    if (!s.started) {
      if (Math.hypot(dx, event.clientY - s.y0) < DRAG_START_PX) return;
      s.started = true;
      setDragging(s.id);
    }
    const days = s.span ? dragDays(pxPerDay, dx) : 0;
    if (s.span && days !== s.days) {
      s.days = days;
      drag.preview(s.id, shifted(s.span, s.mode, days));
    }
    const lane = target(event.clientY);
    setOverLane(lane ? String(lane.parentId ?? "") : null);
  }

  function onPointerUp(event: React.PointerEvent) {
    const s = state.current;
    if (!s || !drag || event.pointerId !== s.pointerId) return;
    if (!s.started) {
      finish();
      return;
    }
    const lane = target(event.clientY);
    if (s.span && s.days !== 0) drag.commit(s.id, shifted(s.span, s.mode, s.days));
    else drag.preview(s.id, null);
    const placement = lane ? laneDrop(wbs, s.id, lane.parentId) : null;
    if (placement) drag.move(s.id, placement);
    finish();
  }

  return {
    dragging,
    overLane,
    handlers: drag
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel }
      : undefined,
  };
}
