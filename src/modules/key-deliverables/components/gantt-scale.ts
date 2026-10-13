import { addDays, dayDiff, utcDay } from "../schemas/wbs";

/**
 * Gantt timeline geometry (ADR-0027): which days the chart shows, how wide a
 * day is at each scale, and the two header rows that keep the dates visible.
 * Dates are UTC-midnight days, like every stored date; x is in pixels from the
 * timeline's first day.
 */

export const GANTT_SCALES = ["day", "week", "month"] as const;
export type GanttScale = (typeof GANTT_SCALES)[number];

export const PX_PER_DAY: Record<GanttScale, number> = { day: 32, week: 12, month: 3 };

/** Room after the last bar for its date label, in days. */
const TRAILING_DAYS: Record<GanttScale, number> = { day: 5, week: 14, month: 45 };

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
  weekend?: boolean;
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

/** The day under an x position. */
export function dayAt(timeline: Timeline, x: number): Date {
  return addDays(timeline.start, Math.floor(x / timeline.pxPerDay));
}

const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

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

function years(timeline: Timeline): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const last = addDays(timeline.start, timeline.days - 1);
  for (let y = timeline.start.getUTCFullYear(); y <= last.getUTCFullYear(); y++) {
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31));
    const from = later(yearStart, timeline.start);
    const to = earlier(yearEnd, last);
    cells.push({
      key: `y${y}`,
      label: String(y),
      left: xOf(timeline, from),
      width: (dayDiff(from, to) + 1) * timeline.pxPerDay,
    });
  }
  return cells;
}

/**
 * The two header rows:
 * - day:   month and year over each day's number (weekends marked);
 * - week:  month and year over the date of each week's Monday;
 * - month: the year over each month's name.
 */
export function headerRows(timeline: Timeline): { top: HeaderCell[]; bottom: HeaderCell[] } {
  if (timeline.scale === "month") {
    return { top: years(timeline), bottom: months(timeline, (d) => MONTH_NAME.format(d)) };
  }
  if (timeline.scale === "week") {
    const bottom: HeaderCell[] = [];
    for (let i = 0; i < timeline.days; i += 7) {
      const monday = addDays(timeline.start, i);
      bottom.push({
        key: `w${i}`,
        label: String(monday.getUTCDate()),
        left: i * timeline.pxPerDay,
        width: 7 * timeline.pxPerDay,
      });
    }
    return { top: months(timeline, (d) => MONTH_SHORT.format(d)), bottom };
  }
  const bottom: HeaderCell[] = [];
  for (let i = 0; i < timeline.days; i++) {
    const day = addDays(timeline.start, i);
    const dow = day.getUTCDay();
    bottom.push({
      key: `d${i}`,
      label: String(day.getUTCDate()),
      left: i * timeline.pxPerDay,
      width: timeline.pxPerDay,
      weekend: dow === 0 || dow === 6,
    });
  }
  return { top: months(timeline, (d) => MONTH_LONG.format(d)), bottom };
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Apr 16" — the dates printed beside a bar. */
export function shortDate(date: Date): string {
  return SHORT_DATE.format(date);
}
