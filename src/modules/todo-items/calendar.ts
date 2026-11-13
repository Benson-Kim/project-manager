import { expandOccurrences, type CalendarWindow, type Occurrence } from "./recurrence";
import { isClosedStatus } from "./schemas/todo-item";
import type { CalendarTodo, TodoOccurrenceRow } from "./schemas/todo-recurrence";

const DAY_MS = 86_400_000;
const ymdOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

/** One thing a calendar day shows: a one-off to-do, or one occurrence of a series. */
export interface CalendarEntry {
  /** Unique in the window: the to-do, plus the occurrence key for a series. */
  key: string;
  todo: CalendarTodo;
  /** The day it shows on, "YYYY-MM-DD". */
  day: string;
  /** "HH:MM" for an hourly series; null for a whole day. */
  time: string | null;
  status: string | null;
  /** Null for a one-off. */
  occurrence: {
    occursAt: string;
    movedTo: string | null;
    isSkipped: boolean;
    /** The series' due date moved with this occurrence, so it keeps its length. */
    dueDate: string | null;
    /** Null while the occurrence has no row of its own. */
    rowVer: number | null;
  } | null;
}

export interface CalendarEntries {
  entries: CalendarEntry[];
  /** How many series were cut short at MAX_OCCURRENCES_PER_WINDOW, for the screen to say so. */
  cut: number;
}

const inWindow = (day: string, window: CalendarWindow) => day >= window.from && day <= window.to;

/**
 * The window's entries, by day, then time, then title. A one-off shows on its StartDate. A series
 * shows each occurrence its rule generates on the day it starts, or was moved to; a row the rule
 * no longer generates is ignored, as in expandOccurrences. A closed series ends its occurrences
 * after `today` (ADR-0059 decision 3).
 */
export function calendarEntries(
  todos: readonly CalendarTodo[],
  rows: readonly TodoOccurrenceRow[],
  window: CalendarWindow,
  today: string,
): CalendarEntries {
  const rowsOf = new Map<number, TodoOccurrenceRow[]>();
  for (const row of rows) rowsOf.set(row.todoItemId, [...(rowsOf.get(row.todoItemId) ?? []), row]);
  const entries: CalendarEntry[] = [];
  let cut = 0;

  for (const todo of todos) {
    const rule = todo.rule;
    if (todo.startDate === null) continue;
    if (rule === null) {
      if (inWindow(todo.startDate, window))
        entries.push({
          key: String(todo.todoItemId),
          todo,
          day: todo.startDate,
          time: null,
          status: todo.status,
          occurrence: null,
        });
      continue;
    }

    const series = { startDate: todo.startDate, dueDate: todo.dueDate };
    const own = new Map((rowsOf.get(todo.todoItemId) ?? []).map((row) => [row.occursAt, row]));
    const expansion = expandOccurrences(series, rule, window);
    if (expansion.more > 0) cut++;
    const generated = new Map(expansion.occurrences.map((o) => [o.occursAt, o]));
    for (const row of own.values()) {
      if (row.movedTo === null || generated.has(row.occursAt)) continue;
      const day = row.occursAt.slice(0, 10);
      const found = expandOccurrences(
        series,
        rule,
        { from: day, to: day },
        Infinity,
      ).occurrences.find((o) => o.occursAt === row.occursAt);
      if (found) generated.set(found.occursAt, found);
    }

    const ended = isClosedStatus(todo.status);
    for (const o of generated.values()) {
      const row = own.get(o.occursAt);
      const startsAt = row?.movedTo ?? o.occursAt;
      const day = startsAt.slice(0, 10);
      if (!inWindow(day, window) || (ended && day > today)) continue;
      entries.push({
        key: `${todo.todoItemId}@${o.occursAt}`,
        todo,
        day,
        time: rule.unit === "Hour" ? startsAt.slice(11, 16) : null,
        status: row?.status ?? null,
        occurrence: {
          occursAt: o.occursAt,
          movedTo: row?.movedTo ?? null,
          isSkipped: row?.isSkipped ?? false,
          dueDate: movedDue(o, day),
          rowVer: row?.rowVer ?? null,
        },
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      (a.todo.title ?? "").localeCompare(b.todo.title ?? "") ||
      a.key.localeCompare(b.key),
  );
  return { entries, cut };
}

function movedDue(o: Occurrence, day: string): string | null {
  if (o.dueDate === null) return null;
  return ymdOf(dayOf(o.dueDate) + dayOf(day) - dayOf(o.occursAt.slice(0, 10)));
}

const MONTH = /^(19\d{2}|2\d{3})-(0[1-9]|1[0-2])$/;

/** The month to show, "YYYY-MM": `?month=` when it is well formed, else the one `today` is in. */
export function calendarMonth(value: string | undefined, today: string): string {
  return value !== undefined && MONTH.test(value) ? value : today.slice(0, 7);
}

/** The day `?day=` names for a new to-do, or null when it is not a real "YYYY-MM-DD" date. */
export function calendarDay(value: string | undefined): string | null {
  if (value === undefined || !MONTH.test(value.slice(0, 7)) || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const ms = dayOf(value);
  return Number.isNaN(ms) || ymdOf(ms) !== value ? null : value;
}

export interface MonthGrid {
  /** Six Monday-first weeks: 42 days, "YYYY-MM-DD". */
  days: string[];
  /** The days the grid covers, which is the window it reads (inside CALENDAR_MAX_DAYS). */
  window: CalendarWindow;
  previous: string;
  next: string;
}

export function monthGrid(month: string): MonthGrid {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = Date.UTC(year, monthNumber - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - lead * DAY_MS;
  const days = Array.from({ length: 42 }, (_, i) => ymdOf(start + i * DAY_MS));
  const shift = (n: number) => ymdOf(Date.UTC(year, monthNumber - 1 + n, 1)).slice(0, 7);
  return {
    days,
    window: { from: ymdOf(start), to: ymdOf(start + 41 * DAY_MS) },
    previous: shift(-1),
    next: shift(1),
  };
}
