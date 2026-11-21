import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { datesInOrder, datesNotPast, datesWere, storedDates } from "../date-range";

const schema = z
  .object({ from: z.date().nullable(), to: z.date().nullable(), label: z.string().optional() })
  .superRefine(datesInOrder({ start: "from", end: "to", message: "To before from" }));

describe("datesInOrder", () => {
  it("puts the issue on the end field", () => {
    const result = schema.safeParse({ from: new Date("2026-02-02"), to: new Date("2026-02-01") });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "custom", path: ["to"], message: "To before from" }),
    ]);
  });

  it.each([
    ["the same day", new Date("2026-02-02"), new Date("2026-02-02")],
    ["an end after the start", new Date("2026-02-02"), new Date("2026-03-01")],
    ["no start", null, new Date("2026-02-01")],
    ["no end", new Date("2026-02-02"), null],
  ])("accepts %s", (_, from, to) => {
    expect(schema.safeParse({ from, to }).success).toBe(true);
  });

  it("ignores values that are not dates (a field that failed to parse)", () => {
    const check = datesInOrder({ start: "from", end: "to", message: "x" });
    const issues: unknown[] = [];
    check({ from: "2026-02-02", to: new Date("2026-01-01") }, {
      addIssue: (issue: unknown) => issues.push(issue),
    } as unknown as z.RefinementCtx);
    expect(issues).toEqual([]);
  });
});

describe("datesInOrder on an update form (datesWere)", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const update = z
    .object({ from: z.date().nullable(), to: z.date().nullable(), ...datesWere("from", "to") })
    .superRefine(datesInOrder({ start: "from", end: "to", message: "To before from" }));
  // Supplier 13 as migrated from Access: its contract ends before it starts.
  const legacy = { from: day("2024-12-26"), to: day("2024-12-17") };
  const stored = storedDates(legacy);

  it("carries the stored dates as YYYY-MM-DD form values", () => {
    expect(stored).toEqual({ fromWas: "2024-12-26", toWas: "2024-12-17" });
    expect(storedDates({ from: null, to: undefined })).toEqual({ fromWas: "", toWas: "" });
  });

  it("lets a record saved with inverted dates be edited while they stay as stored", () => {
    expect(update.safeParse({ ...legacy, ...stored }).success).toBe(true);
  });

  it("refuses the inverted pair once either date is changed", () => {
    expect(update.safeParse({ from: legacy.from, to: day("2024-12-20"), ...stored }).success).toBe(
      false,
    );
    expect(update.safeParse({ from: day("2024-12-27"), to: legacy.to, ...stored }).success).toBe(
      false,
    );
  });

  it("refuses an inverted pair on a record that had no dates, or without stored values", () => {
    expect(update.safeParse({ ...legacy, fromWas: "", toWas: "" }).success).toBe(false);
    expect(update.safeParse(legacy).success).toBe(false);
  });
});

describe("datesNotPast", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const localNow = "2026-03-10T09:00:00";
  const form = z
    .object({
      start: z.date().nullable(),
      due: z.date().nullable(),
      localNow: z.string().optional(),
      ...datesWere("start", "due"),
    })
    .superRefine(datesNotPast("Pick today or later", "start", "due"));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T14:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("refuses a day before the user's today, on that field", () => {
    const result = form.safeParse({ start: day("2026-03-09"), due: day("2026-03-12"), localNow });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["start"], message: "Pick today or later" }),
    ]);
  });

  it("accepts today, later days and no date", () => {
    expect(form.safeParse({ start: day("2026-03-10"), due: null, localNow }).success).toBe(true);
    expect(form.safeParse({ start: null, due: day("2026-04-01"), localNow }).success).toBe(true);
  });

  it("keeps a past date that is still the stored one, but refuses a move to another past day", () => {
    const stored = { startWas: "2026-02-01", dueWas: "" };
    expect(
      form.safeParse({ start: day("2026-02-01"), due: null, localNow, ...stored }).success,
    ).toBe(true);
    expect(
      form.safeParse({ start: day("2026-02-02"), due: null, localNow, ...stored }).success,
    ).toBe(false);
  });

  it("judges today by the browser's clock when it is within 14 hours", () => {
    const ahead = "2026-03-11T01:00:00";
    expect(form.safeParse({ start: day("2026-03-10"), due: null, localNow: ahead }).success).toBe(
      false,
    );
  });
});
