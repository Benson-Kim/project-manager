import { addDays, dayDiff, utcDay } from "../schemas/wbs";

/**
 * Gantt timeline geometry (ADR-0027): which days the chart shows, how wide a
 * day is at each scale, and the period header (quarters or months) over it.
 * Dates are UTC-midnight days, like every stored date; x is in pixels from the
 * timeline's first day.
 */

export const GANTT_SCALES = ["day", "week", "month"] as const;
export type GanttScale = (typeof GANTT_SCALES)[number];

export const PX_PER_DAY: Record<GanttScale, number> = { day: 32, week: 12, month: 2 };

/** Room after the last bar for its date label, in days. */
const TRAILING_DAYS: Record<GanttScale, number> = { day: 5, week: 14, month: 14 };

export interface Timeline {
  scale: GanttScale;
  start: Date;
  /** Days shown, the last one included. */
  days: number;
  pxPerDay: number;
  width: number;
}

export interface HeaderCell {
  key: string;
  label: string;
  left: number;
  width: number;
}

export function isGanttScale(value: unknown): value is GanttScale {
  return typeof value === "string" && (GANTT_SCALES as readonly string[]).includes(value);
}

/** A scale that fits the span: days up to three months, weeks up to a year, then months. */
export function defaultScale(min: Date | null, max: Date | null): GanttScale {
  if (!min || !max) return "day";
  const span = dayDiff(min, max);
  if (span <= 92) return "day";
  if (span <= 366) return "week";
  return "month";
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function later(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function earlier(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Monday on or before the date. */
function mondayOf(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

/**
 * Whole months around the bars (whole weeks at the week scale), with room for
 * the last date label. With no dated item, the current month.
 */
export function makeTimeline(
  scale: GanttScale,
  bounds: { min: Date | null; max: Date | null },
  today: Date,
): Timeline {
  const min = utcDay(bounds.min ?? today);
  const max = utcDay(bounds.max ?? bounds.min ?? today);
  let start = firstOfMonth(min);
  let end = lastOfMonth(addDays(max, TRAILING_DAYS[scale]));
  if (scale === "week") {
    start = mondayOf(start);
    end = addDays(mondayOf(end), 6);
  }
  const days = dayDiff(start, end) + 1;
  const pxPerDay = PX_PER_DAY[scale];
  return { scale, start, days, pxPerDay, width: days * pxPerDay };
}

/** Left edge of a day. */
export function xOf(timeline: Timeline, date: Date): number {
  return dayDiff(timeline.start, date) * timeline.pxPerDay;
}

/** Left edge and width of a bar from its first to its last day. */
export function barBox(
  timeline: Timeline,
  start: Date,
  end: Date,
): { left: number; width: number } {
  const left = xOf(timeline, start);
  return { left, width: Math.max((dayDiff(start, end) + 1) * timeline.pxPerDay, 4) };
}

/** The middle of a day: where a milestone's diamond and the Today line sit. */
export function dayCentre(timeline: Timeline, date: Date): number {
  return xOf(timeline, date) + Math.floor(timeline.pxPerDay / 2);
}

/** Today's line, or null when today is outside the timeline. */
export function todayLeft(timeline: Timeline, today: Date): number | null {
  const offset = dayDiff(timeline.start, today);
  return offset >= 0 && offset < timeline.days ? dayCentre(timeline, today) : null;
}

/** The day under an x position. */
export function dayAt(timeline: Timeline, x: number): Date {
  return addDays(timeline.start, Math.floor(x / timeline.pxPerDay));
}

const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function months(timeline: Timeline, format: (d: Date) => string): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const last = addDays(timeline.start, timeline.days - 1);
  for (
    let m = firstOfMonth(timeline.start);
    m.getTime() <= last.getTime();
    m = addDays(lastOfMonth(m), 1)
  ) {
    const from = later(m, timeline.start);
    const to = earlier(lastOfMonth(m), last);
    cells.push({
      key: `m${m.toISOString()}`,
      label: format(m),
      left: xOf(timeline, from),
      width: (dayDiff(from, to) + 1) * timeline.pxPerDay,
    });
  }
  return cells;
}

function quarters(timeline: Timeline): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const last = addDays(timeline.start, timeline.days - 1);
  const first = timeline.start;
  for (
    let q = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - (first.getUTCMonth() % 3), 1),
    );
    q.getTime() <= last.getTime();
    q = new Date(Date.UTC(q.getUTCFullYear(), q.getUTCMonth() + 3, 1))
  ) {
    const from = later(q, timeline.start);
    const to = earlier(new Date(Date.UTC(q.getUTCFullYear(), q.getUTCMonth() + 3, 0)), last);
    cells.push({
      key: `q${q.toISOString()}`,
      label: `${q.getUTCFullYear()} Q${q.getUTCMonth() / 3 + 1}`,
      left: xOf(timeline, from),
      width: (dayDiff(from, to) + 1) * timeline.pxPerDay,
    });
  }
  return cells;
}

/** The Gantt's period header: quarters, or months at the day scale. */
export function periodCells(timeline: Timeline): HeaderCell[] {
  return timeline.scale === "day"
    ? months(timeline, (d) => MONTH_LONG.format(d))
    : quarters(timeline);
}
