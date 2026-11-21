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
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

const monthsOn = (months: number) => (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const quarterOf = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (date.getUTCMonth() % 3), 1));

const yearOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

/** One cell per calendar period (month, quarter, year) that the timeline touches, cut at its ends. */
function spans(
  timeline: Timeline,
  first: Date,
  next: (period: Date) => Date,
  label: (period: Date) => string,
): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const last = addDays(timeline.start, timeline.days - 1);
  for (let p = first; p.getTime() <= last.getTime(); p = next(p)) {
    const from = later(p, timeline.start);
    const to = earlier(addDays(next(p), -1), last);
    cells.push({
      key: p.toISOString(),
      label: label(p),
      left: xOf(timeline, from),
      width: (dayDiff(from, to) + 1) * timeline.pxPerDay,
    });
  }
  return cells;
}

const months = (timeline: Timeline, format: (d: Date) => string) =>
  spans(timeline, firstOfMonth(timeline.start), monthsOn(1), format);

const quarters = (timeline: Timeline, format: (d: Date) => string) =>
  spans(timeline, quarterOf(timeline.start), monthsOn(3), format);

const quarterName = (d: Date) => `Q${d.getUTCMonth() / 3 + 1}`;

/** The Gantt's period guides: quarters, or months at the day scale. */
export function periodCells(timeline: Timeline): HeaderCell[] {
  return timeline.scale === "day"
    ? months(timeline, (d) => MONTH_LONG.format(d))
    : quarters(timeline, (d) => `${d.getUTCFullYear()} ${quarterName(d)}`);
}

/** Which days get a label: every day, each Monday, or the 1st and 15th, as room allows. */
const DAY_SHOWN: Record<GanttScale, (date: Date) => boolean> = {
  day: () => true,
  week: (date) => date.getUTCDay() === 1,
  month: (date) => date.getUTCDate() === 1 || date.getUTCDate() === 15,
};

/** The day row: "1 Jan", "2", "3", ... where the first label in each month names the month. */
export function dayCells(timeline: Timeline): HeaderCell[] {
  const shown: Date[] = [];
  for (let i = 0; i < timeline.days; i++) {
    const date = addDays(timeline.start, i);
    if (DAY_SHOWN[timeline.scale](date)) shown.push(date);
  }
  return shown.map((date, i) => {
    const left = xOf(timeline, date);
    const right = i + 1 < shown.length ? xOf(timeline, shown[i + 1]) : timeline.width;
    const opensMonth = i === 0 || shown[i - 1].getUTCMonth() !== date.getUTCMonth();
    const day = String(date.getUTCDate());
    return {
      key: date.toISOString(),
      label: opensMonth ? `${day} ${MONTH_SHORT.format(date)}` : day,
      left,
      width: right - left,
    };
  });
}

export interface HeaderRows {
  years: HeaderCell[];
  quarters: HeaderCell[];
  months: HeaderCell[];
}

/** The groups over the day row: years, quarters and months. */
export function groupRows(timeline: Timeline): HeaderRows {
  const monthName = timeline.scale === "month" ? MONTH_SHORT : MONTH_NAME;
  return {
    years: spans(timeline, yearOf(timeline.start), monthsOn(12), (d) => String(d.getUTCFullYear())),
    quarters: quarters(timeline, quarterName),
    months: months(timeline, (d) => monthName.format(d)),
  };
}
