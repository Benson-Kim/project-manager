import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import type { RecurrenceRule } from "../recurrence";
import { draftOf, errorsOf, patternKey, ruleOf } from "../recurrence-draft";
import { recurrenceRuleSchema } from "../schemas/todo-recurrence";

const R = messages.todoItems.repeat;
const WEDNESDAY = "2026-11-04";
const fresh = draftOf(null, WEDNESDAY);

describe("the Repeat section's draft", () => {
  it("starts a new rule as weekly, every 1, on the start date's weekday, with no end", () => {
    expect(ruleOf(fresh)).toEqual({
      unit: "Week",
      every: 1,
      startTime: null,
      weekdays: 4,
      monthMode: null,
      ordinal: null,
      weekday: null,
      endsOn: null,
      endsAfter: null,
    });
    expect(recurrenceRuleSchema.safeParse(ruleOf(fresh)).success).toBe(true);
  });

  it("sends a time only for hourly, days only for weekly, and the weekday only for an nth weekday", () => {
    expect(ruleOf({ ...fresh, unit: "Hour" })).toMatchObject({
      startTime: "09:00",
      weekdays: null,
    });
    expect(ruleOf({ ...fresh, unit: "Day" })).toMatchObject({ startTime: null, weekdays: null });
    expect(ruleOf({ ...fresh, unit: "Month" })).toMatchObject({
      monthMode: "DayOfMonth",
      ordinal: null,
      weekday: null,
      weekdays: null,
    });
    expect(ruleOf({ ...fresh, unit: "Month", monthMode: "NthWeekday" })).toMatchObject({
      ordinal: 1,
      weekday: 3,
    });
  });

  it("sends only the chosen ending", () => {
    expect(ruleOf({ ...fresh, ending: "after", endsOn: "2027-01-01" })).toMatchObject({
      endsOn: null,
      endsAfter: 10,
    });
    expect(ruleOf({ ...fresh, ending: "on", endsOn: "2027-01-01" })).toMatchObject({
      endsOn: "2027-01-01",
      endsAfter: null,
    });
  });

  it("reads a saved rule back unchanged", () => {
    const saved: RecurrenceRule = {
      unit: "Month",
      every: 2,
      startTime: null,
      weekdays: null,
      monthMode: "NthWeekday",
      ordinal: -1,
      weekday: 5,
      endsOn: "2027-06-30",
      endsAfter: null,
    };
    expect(ruleOf(draftOf(saved, WEDNESDAY))).toEqual(saved);
  });

  it("warns on a pattern change and not on an ending change", () => {
    const saved = ruleOf(fresh);
    expect(patternKey(ruleOf({ ...fresh, ending: "after" }))).toBe(patternKey(saved));
    expect(patternKey(ruleOf({ ...fresh, every: "2" }))).not.toBe(patternKey(saved));
    expect(patternKey(ruleOf({ ...fresh, weekdays: 5 }))).not.toBe(patternKey(saved));
    const hourly = ruleOf({ ...fresh, unit: "Hour" });
    expect(patternKey({ ...hourly, startTime: "09:00:00" })).toBe(patternKey(hourly));
  });

  it("gives range issues the proc's words", () => {
    const tooMany = recurrenceRuleSchema.safeParse(ruleOf({ ...fresh, every: "1000" }));
    expect(tooMany.success).toBe(false);
    if (!tooMany.success) expect(errorsOf(tooMany.error).every).toBe(R.everyRange);
    const noDate = recurrenceRuleSchema.safeParse(ruleOf({ ...fresh, ending: "on", endsOn: "" }));
    expect(noDate.success).toBe(false);
    if (!noDate.success) expect(errorsOf(noDate.error).endsOn).toBe(R.endsOnMissing);
  });
});
