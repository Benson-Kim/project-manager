import type { z } from "zod";
import { messages } from "@/lib/messages";
import type { MonthMode, RecurrenceRule, RepeatUnit } from "./recurrence";

/** The Repeat section's form state and its mapping to a rule (ADR-0059), kept apart from React. */

const R = messages.todoItems.repeat;

export type Ending = "never" | "on" | "after";
export type RuleErrors = Partial<Record<keyof RecurrenceRule, string>>;

export interface Draft {
  unit: RepeatUnit;
  every: string;
  startTime: string;
  weekdays: number;
  monthMode: MonthMode;
  ordinal: number;
  weekday: number;
  ending: Ending;
  endsOn: string;
  endsAfter: string;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const bit = (weekday: number) => 1 << (weekday - 1);
/** 1 (Monday) to 7 (Sunday) for a "YYYY-MM-DD" day. */
const weekdayOf = (ymd: string) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function draftOf(saved: RecurrenceRule | null, startDate: string): Draft {
  const startWeekday = weekdayOf(startDate);
  return {
    unit: saved?.unit ?? "Week",
    every: String(saved?.every ?? 1),
    startTime: saved?.startTime?.slice(0, 5) ?? "09:00",
    weekdays: saved?.weekdays ?? bit(startWeekday),
    monthMode: saved?.monthMode ?? "DayOfMonth",
    ordinal: saved?.ordinal ?? 1,
    weekday: saved?.weekday ?? startWeekday,
    ending: saved?.endsOn ? "on" : saved?.endsAfter ? "after" : "never",
    endsOn: saved?.endsOn ?? "",
    endsAfter: String(saved?.endsAfter ?? 10),
  };
}

/** The rule the draft describes; only the fields its unit and ending use are set. */
export function ruleOf(d: Draft): RecurrenceRule {
  const month = d.unit === "Month";
  const nth = month && d.monthMode === "NthWeekday";
  return {
    unit: d.unit,
    every: Number(d.every),
    startTime: d.unit === "Hour" ? d.startTime || null : null,
    weekdays: d.unit === "Week" ? d.weekdays || null : null,
    monthMode: month ? d.monthMode : null,
    ordinal: nth ? d.ordinal : null,
    weekday: nth ? d.weekday : null,
    endsOn: d.ending === "on" ? d.endsOn : null,
    endsAfter: d.ending === "after" ? Number(d.endsAfter) : null,
  };
}

/** How it repeats, leaving out when it ends: changing this drops future occurrence rows. */
export const patternKey = (r: RecurrenceRule) =>
  JSON.stringify([
    r.unit,
    r.every,
    r.startTime?.slice(0, 5) ?? null,
    r.weekdays,
    r.monthMode,
    r.ordinal,
    r.weekday,
  ]);

const RANGE_MESSAGES: RuleErrors = {
  every: R.everyRange,
  endsAfter: R.endsAfterRange,
  endsOn: R.endsOnMissing,
};

/** One message per field: a rule's own sentence, else the proc's range words. */
export function errorsOf(error: z.ZodError): RuleErrors {
  const out: RuleErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof RecurrenceRule;
    out[key] ??=
      issue.code === "custom" ? issue.message : (RANGE_MESSAGES[key] ?? messages.errors.VALIDATION);
  }
  return out;
}
