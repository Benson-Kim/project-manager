import { describe, expect, it } from "vitest";
import { expandOccurrences, type RecurrenceRule } from "@/modules/todo-items/recurrence";

const rule = (r: Partial<RecurrenceRule> & Pick<RecurrenceRule, "unit">): RecurrenceRule => ({
  every: 1,
  startTime: null,
  weekdays: null,
  monthMode: null,
  ordinal: null,
  weekday: null,
  endsOn: null,
  endsAfter: null,
  ...r,
});

const expand = (
  startDate: string,
  r: Parameters<typeof rule>[0],
  from: string,
  to: string,
  dueDate: string | null = null,
) => expandOccurrences({ startDate, dueDate }, rule(r), { from, to });

/** Each occurrence as "YYYY-MM-DD#index", or with its time for an hourly rule. */
const days = (...args: Parameters<typeof expand>) =>
  expand(...args).occurrences.map((o) => `${o.occursAt.slice(0, 10)}#${o.index}`);
const times = (...args: Parameters<typeof expand>) =>
  expand(...args).occurrences.map((o) => o.occursAt);

describe("expandOccurrences: each unit", () => {
  it("every 2 days from the start", () => {
    expect(days("2026-11-02", { unit: "Day", every: 2 }, "2026-11-01", "2026-11-10")).toEqual([
      "2026-11-02#0",
      "2026-11-04#1",
      "2026-11-06#2",
      "2026-11-08#3",
      "2026-11-10#4",
    ]);
  });

  it("a window after the start keeps counting from the start", () => {
    expect(days("2026-01-01", { unit: "Day", every: 3 }, "2026-01-10", "2026-01-16")).toEqual([
      "2026-01-10#3",
      "2026-01-13#4",
      "2026-01-16#5",
    ]);
  });

  it("every 5 hours from the start time, across midnight", () => {
    expect(
      times(
        "2026-11-04",
        { unit: "Hour", every: 5, startTime: "22:00" },
        "2026-11-05",
        "2026-11-05",
      ),
    ).toEqual([
      "2026-11-05T03:00:00",
      "2026-11-05T08:00:00",
      "2026-11-05T13:00:00",
      "2026-11-05T18:00:00",
      "2026-11-05T23:00:00",
    ]);
  });

  it("hourly keeps the wall clock on the day summer time starts", () => {
    const hours = times(
      "2026-03-29",
      { unit: "Hour", startTime: "00:00" },
      "2026-03-29",
      "2026-03-29",
    );
    expect(hours).toHaveLength(24);
    expect(hours[2]).toBe("2026-03-29T02:00:00");
  });

  it("a day rule's occurrences start at midnight", () => {
    expect(times("2026-11-01", { unit: "Day" }, "2026-11-01", "2026-11-01")).toEqual([
      "2026-11-01T00:00:00",
    ]);
  });
});

describe("expandOccurrences: weeks", () => {
  const monThu = { unit: "Week", every: 2, weekdays: 1 | 8 } as const;

  it("every other week on Monday and Thursday, from the first match on or after the start", () => {
    expect(days("2026-11-04", monThu, "2026-11-01", "2026-12-03")).toEqual([
      "2026-11-05#0",
      "2026-11-16#1",
      "2026-11-19#2",
      "2026-11-30#3",
      "2026-12-03#4",
    ]);
  });

  it("a window starting mid-series counts the weeks before it", () => {
    expect(days("2026-11-04", monThu, "2026-11-17", "2026-11-30")).toEqual([
      "2026-11-19#2",
      "2026-11-30#3",
    ]);
  });

  it("Sunday is the mask's top bit", () => {
    expect(days("2026-11-04", { unit: "Week", weekdays: 64 }, "2026-11-01", "2026-11-15")).toEqual([
      "2026-11-08#0",
      "2026-11-15#1",
    ]);
  });

  it("an empty mask yields nothing", () => {
    expect(days("2026-11-04", { unit: "Week", weekdays: 0 }, "2026-11-01", "2026-11-30")).toEqual(
      [],
    );
  });
});

describe("expandOccurrences: months", () => {
  it("the 31st falls on a shorter month's last day", () => {
    expect(
      days("2026-01-31", { unit: "Month", monthMode: "DayOfMonth" }, "2026-02-01", "2026-03-31"),
    ).toEqual(["2026-02-28#1", "2026-03-31#2"]);
  });

  it("every 3 months, with a window that starts in a month between two occurrences", () => {
    expect(
      days(
        "2026-01-15",
        { unit: "Month", every: 3, monthMode: "DayOfMonth" },
        "2026-09-01",
        "2026-10-31",
      ),
    ).toEqual(["2026-10-15#3"]);
  });

  it("the last day of each month", () => {
    expect(
      days("2026-04-10", { unit: "Month", monthMode: "LastDay" }, "2026-04-01", "2026-05-31"),
    ).toEqual(["2026-04-30#0", "2026-05-31#1"]);
  });

  it("the second Tuesday of each month", () => {
    const secondTuesday = {
      unit: "Month",
      monthMode: "NthWeekday",
      ordinal: 2,
      weekday: 2,
    } as const;
    expect(days("2026-11-04", secondTuesday, "2026-11-01", "2026-12-31")).toEqual([
      "2026-11-10#0",
      "2026-12-08#1",
    ]);
    expect(days("2026-11-20", secondTuesday, "2026-11-01", "2026-12-31")).toEqual(["2026-12-08#0"]);
  });

  it("the last Friday of each month", () => {
    const lastFriday = { unit: "Month", monthMode: "NthWeekday", ordinal: -1, weekday: 5 } as const;
    expect(days("2026-11-04", lastFriday, "2026-11-01", "2026-12-31")).toEqual([
      "2026-11-27#0",
      "2026-12-25#1",
    ]);
  });
});

describe("expandOccurrences: endings", () => {
  it("ends after N times", () => {
    expect(days("2026-11-01", { unit: "Day", endsAfter: 3 }, "2026-11-01", "2026-11-10")).toEqual([
      "2026-11-01#0",
      "2026-11-02#1",
      "2026-11-03#2",
    ]);
  });

  it("counts N from the start, not from the window", () => {
    expect(days("2026-11-01", { unit: "Day", endsAfter: 5 }, "2026-11-04", "2026-11-10")).toEqual([
      "2026-11-04#3",
      "2026-11-05#4",
    ]);
    expect(
      days(
        "2025-01-15",
        { unit: "Month", monthMode: "DayOfMonth", endsAfter: 23 },
        "2026-11-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-11-15#22"]);
  });

  it("ends on a date, which takes in the whole of that day", () => {
    expect(
      days("2026-11-01", { unit: "Day", endsOn: "2026-11-03" }, "2026-11-01", "2026-11-10"),
    ).toEqual(["2026-11-01#0", "2026-11-02#1", "2026-11-03#2"]);
    expect(
      times(
        "2026-11-03",
        { unit: "Hour", every: 12, startTime: "06:00", endsOn: "2026-11-03" },
        "2026-11-03",
        "2026-11-04",
      ),
    ).toEqual(["2026-11-03T06:00:00", "2026-11-03T18:00:00"]);
  });
});

describe("expandOccurrences: the window and the cap", () => {
  it("takes in both of the window's days and nothing after", () => {
    expect(days("2026-11-01", { unit: "Day" }, "2026-11-05", "2026-11-05")).toEqual([
      "2026-11-05#4",
    ]);
    expect(
      times(
        "2026-11-01",
        { unit: "Hour", every: 24, startTime: "00:00" },
        "2026-11-02",
        "2026-11-03",
      ),
    ).toEqual(["2026-11-02T00:00:00", "2026-11-03T00:00:00"]);
  });

  it("a window before the start, or ending before it begins, is empty", () => {
    expect(days("2026-12-01", { unit: "Day" }, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(days("2026-11-01", { unit: "Day" }, "2026-11-10", "2026-11-09")).toEqual([]);
  });

  it("refuses a window over 62 days", () => {
    expect(() => expand("2026-11-01", { unit: "Day" }, "2026-11-01", "2027-01-02")).toThrow(
      RangeError,
    );
    expect(
      expand("2026-11-01", { unit: "Day" }, "2026-11-01", "2027-01-01").occurrences,
    ).toHaveLength(62);
  });

  it("an hourly series over two months is cut at 1,000 and counts the rest", () => {
    const { occurrences, more } = expand(
      "2026-11-01",
      { unit: "Hour", startTime: "00:00" },
      "2026-11-01",
      "2026-12-31",
    );
    expect(occurrences).toHaveLength(1000);
    expect(occurrences.at(-1)?.occursAt).toBe("2026-12-12T15:00:00");
    expect(more).toBe(61 * 24 - 1000);
  });

  it("each occurrence keeps the series' length", () => {
    expect(
      expand(
        "2026-11-01",
        { unit: "Day", every: 7 },
        "2026-11-01",
        "2026-11-15",
        "2026-11-03",
      ).occurrences.map((o) => o.dueDate),
    ).toEqual(["2026-11-03", "2026-11-10", "2026-11-17"]);
    expect(
      expand("2026-11-01", { unit: "Day" }, "2026-11-01", "2026-11-01").occurrences[0]?.dueDate,
    ).toBeNull();
  });
});
