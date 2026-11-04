/** A calendar window is at most this many days; usp_Todo_ListCalendar refuses a longer one. */
export const CALENDAR_MAX_DAYS = 62;

/** One series yields at most this many occurrences per window; the screen says when it was cut. */
export const MAX_OCCURRENCES_PER_WINDOW = 1000;

/** A rule repeats every 1 to this many units, and ends after 1 to this many times. */
export const RECURRENCE_MAX_COUNT = 999;

export const REPEAT_UNITS = ["Hour", "Day", "Week", "Month"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export const MONTH_MODES = ["DayOfMonth", "NthWeekday", "LastDay"] as const;
export type MonthMode = (typeof MONTH_MODES)[number];

/** The Nth weekday of a month: the 1st to the 4th, or -1 for the last. */
export const ORDINALS = [1, 2, 3, 4, -1] as const;

/** Weekdays is a bitmask, Monday = 1 up to Sunday = 64, so every day set is 127. */
export const ALL_WEEKDAYS = 127;

/** A rule as app.TodoRecurrence holds it. Dates are "YYYY-MM-DD". */
export interface RecurrenceRule {
  unit: RepeatUnit;
  every: number;
  /** Wall clock "HH:MM" or "HH:MM:SS"; Hour only. */
  startTime: string | null;
  weekdays: number | null;
  monthMode: MonthMode | null;
  ordinal: number | null;
  /** 1 (Monday) to 7 (Sunday); NthWeekday only. */
  weekday: number | null;
  endsOn: string | null;
  endsAfter: number | null;
}

/** The series' own to-do dates, "YYYY-MM-DD". The start is the rule's anchor. */
export interface SeriesDates {
  startDate: string;
  dueDate: string | null;
}

/** "YYYY-MM-DD" to "YYYY-MM-DD", both days included. */
export interface CalendarWindow {
  from: string;
  to: string;
}

export interface Occurrence {
  /** The generated start, wall clock "YYYY-MM-DDTHH:MM:SS": the key of an app.TodoOccurrence row. */
  occursAt: string;
  /** The series' due date moved as far as the start, so each occurrence keeps its length. */
  dueDate: string | null;
  /** 0 for the series' first occurrence; EndsAfter counts these from the anchor, not the window. */
  index: number;
}

export interface Expansion {
  occurrences: Occurrence[];
  /** Occurrences in the window past the cap, for "+N more". */
  more: number;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/*
 * Dates and times are wall clock, held as if UTC, so a change to or from summer time never moves
 * an occurrence. Days are counted from 1970-01-01.
 */
const dayOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / DAY_MS;
const ymdOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
/** 0 for Monday up to 6 for Sunday, the bit order of Weekdays. */
const weekdayOf = (day: number) => (new Date(day * DAY_MS).getUTCDay() + 6) % 7;

interface Candidate {
  ms: number;
  index: number;
}

/**
 * Each unit yields its occurrences in order, without end, from about the window's first day: it
 * jumps there by arithmetic, so a series started years ago costs no more than a new one.
 */
type Candidates = (rule: RecurrenceRule, start: number, from: number) => Iterable<Candidate>;

function* hourly(rule: RecurrenceRule, start: number, from: number): Iterable<Candidate> {
  const [h = 0, m = 0, s = 0] = (rule.startTime ?? "0").split(":").map(Number);
  if (![h, m, s].every(Number.isFinite)) return;
  const anchor = start * DAY_MS + ((h * 60 + m) * 60 + s) * 1000;
  const step = rule.every * HOUR_MS;
  for (let k = Math.max(0, Math.ceil((from * DAY_MS - anchor) / step)); ; k++)
    yield { ms: anchor + k * step, index: k };
}

function* daily(rule: RecurrenceRule, start: number, from: number): Iterable<Candidate> {
  for (let k = Math.max(0, Math.ceil((from - start) / rule.every)); ; k++)
    yield { ms: (start + k * rule.every) * DAY_MS, index: k };
}

function* weekly(rule: RecurrenceRule, start: number, from: number): Iterable<Candidate> {
  const mask = (rule.weekdays ?? 0) & ALL_WEEKDAYS;
  if (mask === 0) return;
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d));
  const monday = start - weekdayOf(start);
  const span = 7 * rule.every;
  const inFirstWeek = days.filter((d) => monday + d >= start).length;
  const first = Math.max(0, Math.floor((from - monday) / span));
  let index = first === 0 ? 0 : inFirstWeek + (first - 1) * days.length;
  for (let j = first; ; j++)
    for (const d of days) {
      const day = monday + j * span + d;
      if (day >= start) yield { ms: day * DAY_MS, index: index++ };
    }
}

/** The day a monthly rule falls on in a month; month may run past 11, as Date.UTC allows. */
function monthDay(rule: RecurrenceRule, year: number, month: number, dayOfMonth: number): number {
  const first = Date.UTC(year, month, 1) / DAY_MS;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = first + length - 1;
  if (rule.monthMode === "LastDay") return last;
  if (rule.monthMode === "NthWeekday") {
    const target = (rule.weekday ?? 1) - 1;
    if (rule.ordinal === -1) return last - ((weekdayOf(last) - target + 7) % 7);
    return first + ((target - weekdayOf(first) + 7) % 7) + ((rule.ordinal ?? 1) - 1) * 7;
  }
  // The 29th to the 31st falls on a shorter month's last day, so no occurrence is lost.
  return first + Math.min(dayOfMonth, length) - 1;
}

function* monthly(rule: RecurrenceRule, start: number, from: number): Iterable<Candidate> {
  const s = new Date(start * DAY_MS);
  const f = new Date(from * DAY_MS);
  const [year, month] = [s.getUTCFullYear(), s.getUTCMonth()];
  const dayIn = (j: number) => monthDay(rule, year, month + j * rule.every, s.getUTCDate());
  const months = (f.getUTCFullYear() - year) * 12 + f.getUTCMonth() - month;
  const first = Math.max(0, Math.floor(months / rule.every));
  let index = first === 0 ? 0 : (dayIn(0) >= start ? 1 : 0) + first - 1;
  for (let j = first; ; j++) {
    const day = dayIn(j);
    if (day >= start) yield { ms: day * DAY_MS, index: index++ };
  }
}

const CANDIDATES: Record<RepeatUnit, Candidates> = {
  Hour: hourly,
  Day: daily,
  Week: weekly,
  Month: monthly,
};

/**
 * The occurrences a series' rule generates in a calendar window, at most `cap` of them. The first
 * is the first day on or after the series' start that the pattern matches. EndsOn takes in the
 * whole of its day. Occurrence rows (done, moved, skipped) are applied by the caller, and only to
 * keys this returns: a row the rule no longer generates is ignored.
 */
export function expandOccurrences(
  series: SeriesDates,
  rule: RecurrenceRule,
  window: CalendarWindow,
  cap = MAX_OCCURRENCES_PER_WINDOW,
): Expansion {
  const start = dayOf(series.startDate);
  const from = dayOf(window.from);
  const to = dayOf(window.to);
  if (to - from + 1 > CALENDAR_MAX_DAYS)
    throw new RangeError(`A calendar window is at most ${CALENDAR_MAX_DAYS} days`);
  const expansion: Expansion = { occurrences: [], more: 0 };
  if (!Number.isFinite(start) || !(to >= from) || !(rule.every >= 1)) return expansion;

  const windowStart = from * DAY_MS;
  const windowEnd = (to + 1) * DAY_MS;
  const endsBefore = rule.endsOn === null ? Infinity : (dayOf(rule.endsOn) + 1) * DAY_MS;
  const dueDays = series.dueDate === null ? null : dayOf(series.dueDate) - start;

  for (const { ms, index } of CANDIDATES[rule.unit](rule, start, from)) {
    if (ms >= windowEnd || ms >= endsBefore) break;
    if (rule.endsAfter !== null && index >= rule.endsAfter) break;
    if (ms < windowStart) continue;
    if (expansion.occurrences.length === cap) {
      expansion.more++;
      continue;
    }
    expansion.occurrences.push({
      occursAt: new Date(ms).toISOString().slice(0, 19),
      dueDate: dueDays === null ? null : ymdOf(Math.floor(ms / DAY_MS) + dueDays),
      index,
    });
  }
  return expansion;
}
