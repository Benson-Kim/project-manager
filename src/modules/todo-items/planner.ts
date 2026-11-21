import type { CalendarEntry } from "./calendar";
import type { PlannerEntry } from "./schemas/todo-schedule";
import {
  nextMidnight,
  slotProblem,
  type SlotClock,
  type SlotProblem,
} from "./schemas/todo-schedule";

export const PLANNER_DAYS = 3;
export const SLOT_MINUTES = 15;
export const DAY_MINUTES = 24 * 60;
export const HOUR_PX = 48;
export const OPEN_AT_MINUTES = 8 * 60;

export interface Slot {
  start: string;
  end: string;
}

export interface PlannerWindow {
  days: string[];
  from: string;
  to: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string | null | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** The three days `?days=` asks for; a missing or invalid value starts at today. */
export function plannerWindow(param: string | null | undefined, today: string): PlannerWindow {
  const from = isDay(param) ? param : today;
  const days = Array.from({ length: PLANNER_DAYS }, (_, i) => addDays(from, i));
  return { days, from, to: days[PLANNER_DAYS - 1] };
}

/** Where the planner opens from a month view: today in the current month, else the 1st. */
export function plannerStartFor(month: string, today: string): string {
  return today.startsWith(month) ? today : `${month}-01`;
}

export function shiftWindow(from: string, direction: -1 | 1): string {
  return addDays(from, direction * PLANNER_DAYS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snapMinutes(minutes: number): number {
  return clamp(Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES, 0, DAY_MINUTES);
}

/** Minutes from `day` 00:00 to the wall-clock `value`; the next day's T00:00 is 1440. */
export function toMinutes(value: string, day: string): number {
  return (Date.parse(`${value}:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 60_000;
}

export function fromMinutes(day: string, minutes: number): string {
  if (minutes >= DAY_MINUTES) return nextMidnight(`${day}T00:00`);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${day}T${hh}:${mm}`;
}

export function minutesToPx(minutes: number): number {
  return (minutes * HOUR_PX) / 60;
}

export function pxToMinutes(px: number): number {
  return (px * 60) / HOUR_PX;
}

function slotLength(slot: Slot): number {
  return (
    toMinutes(slot.end, slot.start.slice(0, 10)) - toMinutes(slot.start, slot.start.slice(0, 10))
  );
}

/** Moves a slot to `day` at the snapped start, keeping its length and ending by midnight. */
export function moveSlot(slot: Slot, day: string, startMinutes: number): Slot {
  const length = slotLength(slot);
  const start = clamp(snapMinutes(startMinutes), 0, DAY_MINUTES - length);
  return { start: fromMinutes(day, start), end: fromMinutes(day, start + length) };
}

/** Moves a slot's end to the snapped minute, at least one slot after its start and by midnight. */
export function resizeSlot(slot: Slot, endMinutes: number): Slot {
  const day = slot.start.slice(0, 10);
  const start = toMinutes(slot.start, day);
  const end = clamp(Math.max(snapMinutes(endMinutes), start + SLOT_MINUTES), 0, DAY_MINUTES);
  return { start: slot.start, end: fromMinutes(day, end) };
}

/** A slot typed as day + "HH:MM" times; an end of 00:00 means midnight at the end of that day. */
export function typedSlot(
  day: string,
  start: string,
  end: string,
  clock?: SlotClock,
): Slot & { problem: SlotProblem | null } {
  const from = `${day}T${start}`;
  const to = end === "00:00" ? nextMidnight(from) : `${day}T${end}`;
  return { start: from, end: to, problem: slotProblem(from, to, clock) };
}

export function slotTimes(slot: Slot): string {
  return `${slot.start.slice(11, 16)}-${slot.end.slice(11, 16)}`;
}

export function slotText(slot: Slot): string {
  return `${slot.start.slice(0, 10)} ${slotTimes(slot)}`;
}

export interface PlacedEntry<T> {
  entry: T;
  top: number;
  bottom: number;
  column: number;
  columns: number;
}

/** The day's entries with their minutes and side-by-side columns where they overlap. */
export function layoutDay<T extends Slot>(entries: readonly T[], day: string): PlacedEntry<T>[] {
  const placed = entries
    .filter((entry) => entry.start.slice(0, 10) === day)
    .map((entry) => ({
      entry,
      top: toMinutes(entry.start, day),
      bottom: toMinutes(entry.end, day),
      column: 0,
      columns: 1,
    }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let group: typeof placed = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const close = () => group.forEach((item) => (item.columns = columnEnds.length));

  for (const item of placed) {
    if (item.top >= groupEnd) {
      close();
      group = [];
      columnEnds = [];
    }
    const free = columnEnds.findIndex((end) => end <= item.top);
    item.column = free === -1 ? columnEnds.length : free;
    columnEnds[item.column] = item.bottom;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  close();
  return placed;
}

/** A to-do's planner slot from the wall-clock dates a list row carries; null until it is placed. */
export function slotOf(start: Date | null, end: Date | null): Slot | null {
  if (!start || !end) return null;
  return { start: start.toISOString().slice(0, 16), end: end.toISOString().slice(0, 16) };
}

export type PlannerBlock = PlannerEntry & {
  /** Set on a repeat of a booked series: the occurrence it stands for. */
  occursAt?: string;
};

const minutesBetween = (slot: Slot) =>
  (Date.parse(`${slot.end}:00Z`) - Date.parse(`${slot.start}:00Z`)) / 60_000;

/**
 * A booked series' repeats in the window, each at the booked time of day (an hourly
 * series at its own time) and as long as the booking. The booked day keeps the real block.
 */
export function plannerRepeats(entries: readonly CalendarEntry[]): PlannerBlock[] {
  return entries.flatMap((entry) => {
    const { todo, occurrence } = entry;
    const slot = todo.slot;
    if (!occurrence || occurrence.isSkipped || !slot || entry.day === slot.start.slice(0, 10)) {
      return [];
    }
    const start = `${entry.day}T${entry.time ?? slot.start.slice(11, 16)}`;
    const end = fromMinutes(entry.day, toMinutes(start, entry.day) + minutesBetween(slot));
    return [
      {
        todoItemId: todo.todoItemId,
        projectId: todo.projectId,
        projectName: todo.projectName,
        title: todo.title ?? "",
        startDate: todo.startDate,
        dueDate: occurrence.dueDate ?? todo.dueDate,
        priority: todo.priority,
        status: entry.status,
        assignee: todo.assignee,
        rowVer: todo.rowVer,
        actorAccess: todo.actorAccess,
        start,
        end,
        occursAt: occurrence.occursAt,
      },
    ];
  });
}
