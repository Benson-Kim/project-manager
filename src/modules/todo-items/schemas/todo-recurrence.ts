import { z } from "zod";
import { LOCAL_WALL_CLOCK } from "@/lib/local-time";
import { listValue } from "@/lib/lookup-lists";
import {
  ALL_WEEKDAYS,
  MONTH_MODES,
  ORDINALS,
  RECURRENCE_MAX_COUNT,
  REPEAT_UNITS,
  type RecurrenceRule,
} from "../recurrence";
import { alertTimeSchema, rowVerSchema } from "./todo-alert";

/**
 * How a to-do repeats (app.TodoRecurrence) and one occurrence's own state (app.TodoOccurrence).
 * The refusals mirror usp_TodoRecurrence_Set's and usp_TodoOccurrence_Set's 50004s word for word,
 * so the form shows the same sentence whichever side catches it.
 */
export const RECURRENCE_ERRORS = {
  hourlyTime: "An hourly repeat needs a start time, and only it has one",
  weeklyDays: "A weekly repeat needs at least one day, and only it has days",
  monthlyPattern: "A monthly repeat needs a pattern, and only it has one",
  monthWeekday: "Choose which weekday of the month",
  oneEnding: "A repeat ends on a date or after a number of times, not both",
  skipped: "A skipped occurrence has no status and is not moved",
} as const;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const wallClock = z.string().regex(LOCAL_WALL_CLOCK);
const count = z.number().int().min(1).max(RECURRENCE_MAX_COUNT);
const ordinal = z
  .number()
  .int()
  .refine((v) => (ORDINALS as readonly number[]).includes(v));

export const recurrenceRuleSchema = z
  .object({
    unit: z.enum(REPEAT_UNITS),
    every: count,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
      .nullable(),
    weekdays: z.number().int().min(1).max(ALL_WEEKDAYS).nullable(),
    monthMode: z.enum(MONTH_MODES).nullable(),
    ordinal: ordinal.nullable(),
    weekday: z.number().int().min(1).max(7).nullable(),
    endsOn: ymd.nullable(),
    endsAfter: count.nullable(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const refuse = (path: keyof RecurrenceRule, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if ((rule.unit === "Hour") !== (rule.startTime !== null))
      refuse("startTime", RECURRENCE_ERRORS.hourlyTime);
    if ((rule.unit === "Week") !== (rule.weekdays !== null))
      refuse("weekdays", RECURRENCE_ERRORS.weeklyDays);
    if ((rule.unit === "Month") !== (rule.monthMode !== null))
      refuse("monthMode", RECURRENCE_ERRORS.monthlyPattern);
    const nth = rule.monthMode === "NthWeekday";
    if (nth !== (rule.ordinal !== null) || nth !== (rule.weekday !== null))
      refuse("weekday", RECURRENCE_ERRORS.monthWeekday);
    if (rule.endsOn !== null && rule.endsAfter !== null)
      refuse("endsAfter", RECURRENCE_ERRORS.oneEnding);
  }) satisfies z.ZodType<RecurrenceRule>;

export const setTodoRecurrenceInput = z
  .object({
    todoItemId: z.number().int().positive(),
    rowVer: rowVerSchema,
    rule: recurrenceRuleSchema,
    /** The browser's wall clock, so "future occurrences" means the user's own today. */
    localNow: wallClock.optional(),
  })
  .strict();
export type SetTodoRecurrenceInput = z.input<typeof setTodoRecurrenceInput>;

export const clearTodoRecurrenceInput = z
  .object({ todoItemId: z.number().int().positive(), rowVer: rowVerSchema })
  .strict();
export type ClearTodoRecurrenceInput = z.input<typeof clearTodoRecurrenceInput>;

export const setTodoOccurrenceInput = z
  .object({
    todoItemId: z.number().int().positive(),
    /** The key expandOccurrences gave this occurrence. */
    occursAt: wallClock,
    status: listValue.nullable(),
    movedTo: wallClock.nullable(),
    isSkipped: z.boolean(),
    /** Null for an occurrence with no row yet. */
    rowVer: rowVerSchema.nullable(),
  })
  .strict()
  .refine((o) => !o.isSkipped || (o.status === null && o.movedTo === null), {
    path: ["isSkipped"],
    message: RECURRENCE_ERRORS.skipped,
  });
export type SetTodoOccurrenceInput = z.input<typeof setTodoOccurrenceInput>;

const dateOnly = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
const wallClockOf = (d: Date) => d.toISOString().slice(0, 19);

/** The rule's columns, as usp_TodoRecurrence_Set, _GetById and usp_TodoItem_List return them. */
const ruleColumns = {
  RepeatUnit: z.enum(REPEAT_UNITS),
  RepeatEvery: z.number().int(),
  StartTime: alertTimeSchema,
  Weekdays: z.number().int().nullable(),
  MonthMode: z.enum(MONTH_MODES).nullable(),
  Ordinal: z.number().int().nullable(),
  Weekday: z.number().int().nullable(),
  EndsOn: z.date().nullable(),
  EndsAfter: z.number().int().nullable(),
};
const ruleColumnsSchema = z.object(ruleColumns);

/** The rule expandOccurrences reads, from its columns. */
function ruleOf(r: z.output<typeof ruleColumnsSchema>): RecurrenceRule {
  return {
    unit: r.RepeatUnit,
    every: r.RepeatEvery,
    startTime: r.StartTime,
    weekdays: r.Weekdays,
    monthMode: r.MonthMode,
    ordinal: r.Ordinal,
    weekday: r.Weekday,
    endsOn: dateOnly(r.EndsOn),
    endsAfter: r.EndsAfter,
  };
}

/** usp_TodoRecurrence_Set's and _GetById's result, as the rule expandOccurrences reads. */
export const todoRecurrenceRowSchema = ruleColumnsSchema
  .extend({ TodoItemId: z.number().int(), RowVer: rowVerSchema })
  .transform((r) => ({ todoItemId: r.TodoItemId, rowVer: r.RowVer, rule: ruleOf(r) }));
export type TodoRecurrence = z.output<typeof todoRecurrenceRowSchema>;

/** FOR JSON writes DATETIME2(0) as wall clock "YYYY-MM-DDTHH:MM:SS", the occurrence key. */
const listedOccurrenceSchema = z.object({
  OccursAt: wallClock,
  Status: z.string().nullable(),
  MovedTo: wallClock.nullable(),
  IsSkipped: z.boolean(),
});

/** A series row of usp_TodoItem_List: its rule, and its occurrence rows from the list's lookback. */
export const listedSeriesSchema = ruleColumnsSchema
  .extend({
    Occurrences: z
      .string()
      .nullable()
      .transform((json) => (json === null ? [] : (JSON.parse(json) as unknown)))
      .pipe(z.array(listedOccurrenceSchema)),
  })
  .transform((r) => ({
    rule: ruleOf(r),
    occurrences: r.Occurrences.map((o) => ({
      occursAt: o.OccursAt,
      status: o.Status,
      movedTo: o.MovedTo,
      isSkipped: o.IsSkipped,
    })),
  }));
export type ListedSeries = z.output<typeof listedSeriesSchema>;

/** usp_TodoOccurrence_Set's result; DATETIME2 wall clock comes back as a Date holding it in UTC. */
export const todoOccurrenceRowSchema = z
  .object({
    TodoOccurrenceId: z.number().int(),
    TodoItemId: z.number().int(),
    OccursAt: z.date(),
    Status: z.string().nullable(),
    MovedTo: z.date().nullable(),
    IsSkipped: z.boolean(),
    RowVer: rowVerSchema,
  })
  .transform((r) => ({
    todoOccurrenceId: r.TodoOccurrenceId,
    todoItemId: r.TodoItemId,
    occursAt: wallClockOf(r.OccursAt),
    status: r.Status,
    movedTo: r.MovedTo === null ? null : wallClockOf(r.MovedTo),
    isSkipped: r.IsSkipped,
    rowVer: r.RowVer,
  }));
export type TodoOccurrenceRow = z.output<typeof todoOccurrenceRowSchema>;
