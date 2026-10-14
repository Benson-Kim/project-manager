"use client";

import { useRef, useState } from "react";
import type { OptionColor } from "@/lib/lookup-lists";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { statusToCompletion } from "../schemas/key-deliverable";
import { addDays, dayDiff, durationDays, type WbsNode } from "../schemas/wbs";
import { barBox, barHitPad, dayAt, type Timeline } from "./gantt-scale";

export interface Span {
  start: Date;
  end: Date;
}

/** How the editor hears about a bar being dragged, stretched, drawn or nudged. */
export interface BarHandlers {
  /** Show these dates while the pointer is down; null puts the bar back. */
  preview: (id: number, span: Span | null) => void;
  /** Show these dates and save them once the keys have been still for a moment. */
  nudge: (id: number, span: Span) => void;
  /** Save a nudge now (the bar lost focus). */
  flush: () => void;
  commit: (id: number, span: Span) => void;
  open: (id: number) => void;
}

/** Bar colours, written out so Tailwind sees every class. */
const TONE: Record<OptionColor, { bar: string; ink: string }> = {
  red: { bar: "border-tone-red-ink bg-tone-red-soft", ink: "bg-tone-red-ink" },
  orange: { bar: "border-tone-orange-ink bg-tone-orange-soft", ink: "bg-tone-orange-ink" },
  yellow: { bar: "border-tone-yellow-ink bg-tone-yellow-soft", ink: "bg-tone-yellow-ink" },
  green: { bar: "border-tone-green-ink bg-tone-green-soft", ink: "bg-tone-green-ink" },
  blue: { bar: "border-tone-blue-ink bg-tone-blue-soft", ink: "bg-tone-blue-ink" },
  purple: { bar: "border-tone-purple-ink bg-tone-purple-soft", ink: "bg-tone-purple-ink" },
  gray: { bar: "border-tone-gray-ink bg-tone-gray-soft", ink: "bg-tone-gray-ink" },
};

type DragMode = "move" | "start" | "end";

function shifted(span: Span, mode: DragMode, days: number): Span {
  if (mode === "move") return { start: addDays(span.start, days), end: addDays(span.end, days) };
  if (mode === "start") {
    const start = addDays(span.start, days);
    return { start: dayDiff(start, span.end) < 0 ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: dayDiff(span.start, end) < 0 ? span.start : end };
}

/** The pixels a pointer must travel before a press becomes a drag. */
const DRAG_SLOP = 3;

interface Drag {
  pointerId: number;
  x0: number;
  mode: DragMode;
  span: Span;
  days: number;
  moved: boolean;
}

/**
 * One item's bar (ADR-0027). An item without sub-items is a bar: drag its body
 * to move it, its ends to change its start or end. An item with sub-items is a
 * summary bracket over its branch: dragging it moves the whole branch. Whole
 * days only. Keyboard: ← → move a day; Shift+← → move the end; Enter opens the
 * details. The button is at least 40 px each way, so a short or thin bar can
 * still be hit; the bar is drawn in the middle of it.
 */
export function WbsBar({
  node,
  timeline,
  editable,
  on,
}: {
  node: WbsNode & { start: Date; end: Date };
  timeline: Timeline;
  editable: boolean;
  on: BarHandlers;
}) {
  const drag = useRef<Drag | null>(null);
  const id = node.item.id;
  const summary = node.childIds.length > 0;
  const tone = TONE[node.color];
  const { left, width } = barBox(timeline, node.start, node.end);
  const pad = barHitPad(width);
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const label = messages.keyDeliverables.wbs.barName(
    node.code,
    name,
    formatDate(node.start),
    formatDate(node.end),
    durationDays(node.start, node.end),
  );

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!editable || event.button !== 0) return;
    const edge = (event.target as HTMLElement).dataset.edge;
    const mode: DragMode = summary ? "move" : edge === "start" || edge === "end" ? edge : "move";
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      mode,
      span: { start: node.start, end: node.end },
      days: 0,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG_SLOP) return;
    d.moved = true;
    const days = Math.round(dx / timeline.pxPerDay);
    if (days === d.days) return;
    d.days = days;
    on.preview(id, shifted(d.span, d.mode, days));
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (d.days !== 0) on.commit(id, shifted(d.span, d.mode, d.days));
    else if (d.moved) on.preview(id, null);
  }

  function onPointerCancel() {
    if (!drag.current) return;
    drag.current = null;
    on.preview(id, null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      on.open(id);
      return;
    }
    if (!editable || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    if (event.shiftKey && summary) return;
    event.preventDefault();
    const days = event.key === "ArrowLeft" ? -1 : 1;
    on.nudge(
      id,
      shifted({ start: node.start, end: node.end }, event.shiftKey ? "end" : "move", days),
    );
  }

  return (
    <button
      type="button"
      data-testid={`gantt-bar-${id}`}
      data-gantt-bar={id}
      aria-label={summary ? `${label}, ${messages.keyDeliverables.wbs.summaryNote}` : label}
      className={`group absolute top-1/2 h-10 -translate-y-1/2 touch-none outline-none ${
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
      style={{ left: left - pad, width: width + 2 * pad }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onKeyDown={onKeyDown}
      onBlur={on.flush}
      onDoubleClick={() => on.open(id)}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-sm outline-offset-2 group-focus-visible:outline-2 group-focus-visible:outline-focus ${summary ? "h-4" : "h-6"}`}
        style={{ left: pad, right: pad }}
      >
        {summary ? (
          <>
            <span className={`absolute inset-x-0 top-0 h-2 rounded-sm ${tone.ink}`} />
            <span
              className={`absolute top-0 left-0 h-4 w-2 [clip-path:polygon(0_0,100%_0,0_100%)] ${tone.ink}`}
            />
            <span
              className={`absolute top-0 right-0 h-4 w-2 [clip-path:polygon(0_0,100%_0,100%_100%)] ${tone.ink}`}
            />
          </>
        ) : (
          <span className={`absolute inset-0 overflow-hidden rounded-sm border ${tone.bar}`}>
            <span
              className={`absolute inset-y-0 left-0 ${tone.ink}`}
              style={{ width: `${statusToCompletion(node.item.status)}%` }}
            />
          </span>
        )}
      </span>
      {!summary && editable ? (
        <>
          <span
            aria-hidden="true"
            data-edge="start"
            className="absolute inset-y-0 flex w-3 cursor-ew-resize items-center justify-center"
            style={{ left: pad - 6 }}
          >
            <span
              data-edge="start"
              className="h-3 w-1 rounded-full bg-ink-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </span>
          <span
            aria-hidden="true"
            data-edge="end"
            className="absolute inset-y-0 flex w-3 cursor-ew-resize items-center justify-center"
            style={{ right: pad - 6 }}
          >
            <span
              data-edge="end"
              className="h-3 w-1 rounded-full bg-ink-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </span>
        </>
      ) : null}
    </button>
  );
}

/**
 * Drag across the empty track of an item without dates to draw its bar.
 * Returns the pointer handlers for the track.
 */
export function useDrawBar(id: number, timeline: Timeline, enabled: boolean, on: BarHandlers) {
  const draw = useRef<{ pointerId: number; from: Date; span: Span | null } | null>(null);
  // The preview gives the item dates, which would disable drawing half-way through.
  const [drawing, setDrawing] = useState(false);

  function dayOf(event: React.PointerEvent<HTMLElement>): Date {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - box.left, 0), timeline.width - 1);
    return dayAt(timeline, x);
  }

  return enabled || drawing
    ? {
        onPointerDown(event: React.PointerEvent<HTMLElement>) {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          draw.current = { pointerId: event.pointerId, from: dayOf(event), span: null };
          setDrawing(true);
        },
        onPointerMove(event: React.PointerEvent<HTMLElement>) {
          const d = draw.current;
          if (!d || d.pointerId !== event.pointerId) return;
          const day = dayOf(event);
          if (!d.span && dayDiff(d.from, day) === 0) return;
          const span =
            dayDiff(d.from, day) < 0 ? { start: day, end: d.from } : { start: d.from, end: day };
          if (
            d.span &&
            dayDiff(d.span.start, span.start) === 0 &&
            dayDiff(d.span.end, span.end) === 0
          ) {
            return;
          }
          d.span = span;
          on.preview(id, span);
        },
        onPointerUp(event: React.PointerEvent<HTMLElement>) {
          const d = draw.current;
          if (!d || d.pointerId !== event.pointerId) return;
          draw.current = null;
          setDrawing(false);
          if (d.span) on.commit(id, d.span);
        },
        onPointerCancel() {
          if (!draw.current) return;
          draw.current = null;
          setDrawing(false);
          on.preview(id, null);
        },
      }
    : {};
}
