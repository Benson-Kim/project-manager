import { describe, expect, it } from "vitest";
import { z } from "zod";
import { datesInOrder, datesWere, storedDates } from "../date-range";

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
