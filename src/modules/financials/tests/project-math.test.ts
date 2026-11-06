import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  duration,
  earnedValue,
  isWeekend,
  parseDate,
  percentChange,
  percentOf,
  pert,
  shareOfTotal,
  toIsoDate,
  weekdayName,
} from "@/modules/financials/calc/project-math";

describe("earnedValue", () => {
  const metrics = earnedValue({ bac: 250_000, pv: 120_000, ev: 110_000, ac: 130_000 });

  it("derives the variances and indices", () => {
    expect(metrics.cv).toBe(-20_000);
    expect(metrics.sv).toBe(-10_000);
    expect(metrics.cpi).toBeCloseTo(0.8461538, 6);
    expect(metrics.spi).toBeCloseTo(0.9166666, 6);
    expect(metrics.pctComplete).toBeCloseTo(0.44, 10);
  });

  it("forecasts to completion from CPI", () => {
    expect(metrics.eac).toBeCloseTo(295_454.5454, 3);
    expect(metrics.etc).toBeCloseTo(165_454.5454, 3);
    expect(metrics.vac).toBeCloseTo(-45_454.5454, 3);
    expect(metrics.tcpi).toBeCloseTo(1.1666666, 6);
  });

  it("accepts formatted currency strings", () => {
    const fromStrings = earnedValue({
      bac: "$250,000",
      pv: "120,000",
      ev: "110,000",
      ac: "130,000",
    });
    expect(fromStrings.cv).toBe(-20_000);
    expect(fromStrings.cpi).toBeCloseTo(0.8461538, 6);
  });

  it("returns nulls rather than Infinity when inputs are missing", () => {
    const empty = earnedValue({ bac: "", pv: "", ev: "", ac: "" });
    expect(empty.cv).toBeNull();
    expect(empty.cpi).toBeNull();
    expect(empty.eac).toBeNull();
    expect(empty.tcpi).toBeNull();

    const noZero = earnedValue({ bac: 100, pv: 0, ev: 10, ac: 0 });
    expect(noZero.cpi).toBeNull();
    expect(noZero.eac).toBeNull();
    expect(noZero.spi).toBeNull();
  });
});

describe("pert", () => {
  it("weights the three points", () => {
    const result = pert({ optimistic: 5, mostLikely: 8, pessimistic: 14 });
    expect(result.expected).toBeCloseTo(8.5, 10);
    expect(result.sd).toBeCloseTo(1.5, 10);
    expect(result.variance).toBeCloseTo(2.25, 10);
    expect(result.low95).toBeCloseTo(5.5, 10);
    expect(result.high95).toBeCloseTo(11.5, 10);
    expect(result.inverted).toBe(false);
    expect(result.wide).toBe(false);
  });

  it("flags inverted and wide estimates", () => {
    expect(pert({ optimistic: 10, mostLikely: 8, pessimistic: 4 }).inverted).toBe(true);
    expect(pert({ optimistic: 1, mostLikely: 1, pessimistic: 30 }).wide).toBe(true);
  });

  it("returns nulls for incomplete input", () => {
    expect(pert({ optimistic: "", mostLikely: 8, pessimistic: 14 }).expected).toBeNull();
  });
});

describe("percentages", () => {
  it("computes percent change", () => {
    const change = percentChange({ from: 48_000, to: 52_500 });
    expect(change.delta).toBe(4_500);
    expect(change.pct).toBeCloseTo(9.375, 10);
    expect(change.multiplier).toBeCloseTo(1.09375, 10);
  });

  it("guards against a zero base", () => {
    const change = percentChange({ from: 0, to: 500 });
    expect(change.pct).toBeNull();
    expect(change.multiplier).toBeNull();
    expect(change.delta).toBe(500);
  });

  it("computes X% of Y and share of total", () => {
    expect(percentOf({ rate: 15, amount: 8_200 }).value).toBeCloseTo(1_230, 10);
    expect(percentOf({ rate: "", amount: 8_200 }).value).toBeNull();

    const share = shareOfTotal({ part: 34_000, total: 250_000 });
    expect(share.pct).toBeCloseTo(13.6, 10);
    expect(share.remaining).toBe(216_000);
    expect(shareOfTotal({ part: 1, total: 0 }).pct).toBeNull();
  });
});

describe("dates", () => {
  it("parses ISO dates without timezone drift", () => {
    const ms = parseDate("2026-11-06");
    expect(ms).not.toBeNull();
    expect(toIsoDate(ms as number)).toBe("2026-11-06");
    expect(weekdayName(ms as number)).toBe("Fri");
  });

  it("rejects junk", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("2026-1-5")).toBeNull();
  });

  it("knows weekends", () => {
    expect(isWeekend(parseDate("2026-11-07") as number)).toBe(true); // Saturday
    expect(isWeekend(parseDate("2026-11-08") as number)).toBe(true); // Sunday
    expect(isWeekend(parseDate("2026-11-09") as number)).toBe(false); // Monday
  });
});

describe("duration", () => {
  it("counts inclusive calendar and working days", () => {
    const result = duration({ start: "2026-11-06", end: "2026-12-04", holidays: 2 });
    expect(result.calendarDays).toBe(29);
    expect(result.weekdays).toBe(21);
    expect(result.workingDays).toBe(19);
    expect(result.workWeeks).toBe(3);
    expect(result.workRemainder).toBe(4);
    expect(result.reversed).toBe(false);
  });

  it("never returns a negative working-day count", () => {
    const result = duration({ start: "2026-11-06", end: "2026-11-09", holidays: 10 });
    expect(result.workingDays).toBe(0);
  });

  it("flags reversed ranges but still reports an absolute span", () => {
    const result = duration({ start: "2026-12-04", end: "2026-11-06" });
    expect(result.reversed).toBe(true);
    expect(result.calendarDays).toBe(29);
  });

  it("returns nulls when a date is missing", () => {
    expect(duration({ start: "", end: "2026-11-06" }).calendarDays).toBeNull();
    expect(duration({ start: "2026-11-06", end: "" }).workingDays).toBeNull();
  });
});

describe("addWorkingDays", () => {
  it("skips weekends going forwards", () => {
    const result = addWorkingDays({ start: "2026-11-06", days: 15 });
    expect(result.date).toBe("2026-11-27");
    expect(result.weekday).toBe("Fri");
  });

  it("skips weekends going backwards", () => {
    expect(addWorkingDays({ start: "2026-11-27", days: -5 }).date).toBe("2026-11-20");
  });

  it("skips holidays before counting days", () => {
    expect(addWorkingDays({ start: "2026-11-06", days: 1, holidays: 1 }).date).toBe("2026-11-10");
  });

  it("returns null for missing input", () => {
    expect(addWorkingDays({ start: "", days: 5 }).dateMs).toBeNull();
    expect(addWorkingDays({ start: "2026-11-06", days: "abc" }).dateMs).toBeNull();
  });
});
