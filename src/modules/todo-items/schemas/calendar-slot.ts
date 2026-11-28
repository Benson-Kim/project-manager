import { z } from "zod";
import { isPlannerTime, nextMidnight } from "./todo-schedule";

const plannerTime = z.string().refine(isPlannerTime);

export const scheduleConflictInput = z.strictObject({
  todoItemId: z.number().int().positive(),
  start: plannerTime,
  end: plannerTime,
});

/** A wall-clock slot, "YYYY-MM-DDTHH:MM" at both ends. */
export interface Slot {
  start: string;
  end: string;
}

/** What the to-do list's calendar pop-up holds: one day and two "HH:MM" times. */
export interface CalendarForm {
  day: string;
  startTime: string;
  endTime: string;
}

export interface SlotSource {
  start: string | null;
  end: string | null;
  startDate: string | null;
  dueDate: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Slots that only touch (one ends as the other starts) do not clash. */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findConflict<T extends Slot & { todoItemId: number }>(
  slot: Slot,
  others: readonly T[],
  todoItemId: number,
): T | null {
  return (
    others.find((other) => other.todoItemId !== todoItemId && slotsOverlap(slot, other)) ?? null
  );
}

export function formFromSlot(slot: Slot): CalendarForm {
  return {
    day: slot.start.slice(0, 10),
    startTime: slot.start.slice(11, 16),
    endTime: slot.end.slice(11, 16),
  };
}

/** An end time of 00:00 means the midnight that closes the day. */
export function slotFromForm(form: CalendarForm): Slot {
  const start = `${form.day}T${form.startTime.slice(0, 5)}`;
  const endTime = form.endTime.slice(0, 5);
  return { start, end: endTime === "00:00" ? nextMidnight(start) : `${form.day}T${endTime}` };
}

/**
 * The pop-up opens on the slot already booked; otherwise on the to-do's own start or due
 * date when that is not past, else today, for one hour from the next whole hour.
 */
export function defaultCalendarForm(source: SlotSource, now: string): CalendarForm {
  if (source.start && source.end) return formFromSlot({ start: source.start, end: source.end });
  const today = now.slice(0, 10);
  const own = [source.startDate, source.dueDate].find(
    (day): day is string => !!day && day >= today,
  );
  let day = own ?? today;
  let hour = Number(now.slice(11, 13)) + 1;
  if (hour > 23) {
    hour = 0;
    if (day === today) day = nextMidnight(`${day}T00:00`).slice(0, 10);
  }
  return { day, startTime: `${pad(hour)}:00`, endTime: `${pad((hour + 1) % 24)}:00` };
}
