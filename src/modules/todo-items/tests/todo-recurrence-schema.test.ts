import { describe, expect, it } from "vitest";
import type { RecurrenceRule } from "@/modules/todo-items/recurrence";
import {
  RECURRENCE_ERRORS,
  recurrenceRuleSchema,
  setTodoOccurrenceInput,
  todoRecurrenceRowSchema,
} from "@/modules/todo-items/schemas/todo-recurrence";

const base: RecurrenceRule = {
  unit: "Day",
  every: 1,
  startTime: null,
  weekdays: null,
  monthMode: null,
  ordinal: null,
  weekday: null,
  endsOn: null,
  endsAfter: null,
};
const refusal = (r: Partial<RecurrenceRule>) =>
  recurrenceRuleSchema.safeParse({ ...base, ...r }).error?.issues.map((i) => i.message);

describe("recurrenceRuleSchema", () => {
  it("accepts each unit with only its own fields", () => {
    for (const r of [
      {},
      { unit: "Hour", startTime: "09:30" },
      { unit: "Week", every: 2, weekdays: 1 | 8 },
      { unit: "Month", monthMode: "LastDay", endsAfter: 12 },
      { unit: "Month", monthMode: "NthWeekday", ordinal: -1, weekday: 5, endsOn: "2027-01-31" },
    ] as Partial<RecurrenceRule>[])
      expect(refusal(r)).toBeUndefined();
  });

  it("refuses what the proc refuses, in its words", () => {
    expect(refusal({ unit: "Hour" })).toEqual([RECURRENCE_ERRORS.hourlyTime]);
    expect(refusal({ startTime: "09:00" })).toEqual([RECURRENCE_ERRORS.hourlyTime]);
    expect(refusal({ unit: "Week" })).toEqual([RECURRENCE_ERRORS.weeklyDays]);
    expect(refusal({ unit: "Month" })).toEqual([RECURRENCE_ERRORS.monthlyPattern]);
    expect(refusal({ unit: "Month", monthMode: "NthWeekday", ordinal: 2 })).toEqual([
      RECURRENCE_ERRORS.monthWeekday,
    ]);
    expect(refusal({ endsOn: "2027-01-01", endsAfter: 3 })).toEqual([RECURRENCE_ERRORS.oneEnding]);
  });

  it("refuses out-of-range values and unknown fields", () => {
    expect(refusal({ every: 0 })).toBeDefined();
    expect(refusal({ every: 1000 })).toBeDefined();
    expect(refusal({ unit: "Week", weekdays: 128 })).toBeDefined();
    expect(refusal({ unit: "Hour", startTime: "24:00" })).toBeDefined();
    expect(
      refusal({ unit: "Month", monthMode: "NthWeekday", ordinal: 5, weekday: 1 }),
    ).toBeDefined();
    expect(recurrenceRuleSchema.safeParse({ ...base, projectId: 1 }).success).toBe(false);
  });
});

describe("setTodoOccurrenceInput", () => {
  const occurrence = {
    todoItemId: 1,
    occursAt: "2026-11-04T00:00:00",
    status: null,
    movedTo: null,
    isSkipped: true,
    rowVer: null,
  };

  it("a skipped occurrence has no status and is not moved", () => {
    expect(setTodoOccurrenceInput.safeParse(occurrence).success).toBe(true);
    expect(
      setTodoOccurrenceInput.safeParse({ ...occurrence, status: "Completed" }).error?.issues[0]
        ?.message,
    ).toBe(RECURRENCE_ERRORS.skipped);
  });

  it("takes only a wall-clock key", () => {
    expect(
      setTodoOccurrenceInput.safeParse({ ...occurrence, occursAt: "2026-11-04T00:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("todoRecurrenceRowSchema", () => {
  it("reads the proc's row as the rule expandOccurrences takes", () => {
    expect(
      todoRecurrenceRowSchema.parse({
        TodoItemId: 7,
        RepeatUnit: "Hour",
        RepeatEvery: 4,
        StartTime: new Date(Date.UTC(1970, 0, 1, 9, 30)),
        Weekdays: null,
        MonthMode: null,
        Ordinal: null,
        Weekday: null,
        EndsOn: new Date(Date.UTC(2026, 11, 31)),
        EndsAfter: null,
        RowVer: "42",
      }),
    ).toEqual({
      todoItemId: 7,
      rowVer: 42,
      rule: { ...base, unit: "Hour", every: 4, startTime: "09:30:00", endsOn: "2026-12-31" },
    });
  });
});
