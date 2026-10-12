import { describe, expect, it } from "vitest";
import { z } from "zod";
import { datesInOrder } from "../date-range";

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
