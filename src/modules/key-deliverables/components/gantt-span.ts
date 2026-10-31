import { addDays, dayDiff } from "../schemas/wbs";

/** An item's first and last day. */
export interface Span {
  start: Date;
  end: Date;
}

/** What a drag or an arrow key changes: the whole span, or one of its ends. */
export type DragMode = "move" | "start" | "end";

/** The span moved, or one end moved, by whole days; an end never passes the other. */
export function shifted(span: Span, mode: DragMode, days: number): Span {
  if (mode === "move") return { start: addDays(span.start, days), end: addDays(span.end, days) };
  if (mode === "start") {
    const start = addDays(span.start, days);
    return { start: dayDiff(start, span.end) < 0 ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: dayDiff(span.start, end) < 0 ? span.start : end };
}
