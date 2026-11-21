import { describe, expect, it } from "vitest";
import { localWallClock } from "../local-time";
import { isPastDay, isPastMinute, userNow } from "../not-past";

const now = new Date("2026-03-10T12:00:00Z");
const machine = localWallClock(now).slice(0, 16);

describe("userNow", () => {
  it("trusts the browser's clock within 14 hours, to the minute", () => {
    expect(userNow("2026-03-10T15:00:42", now)).toBe("2026-03-10T15:00");
    expect(userNow("2026-03-10T01:30:00", now)).toBe("2026-03-10T01:30");
  });

  it.each([
    ["nothing sent", null],
    ["an empty value", ""],
    ["a value that is not a wall clock", "yesterday"],
    ["a date without a time", "2026-03-10"],
    ["a clock more than 14 hours out", "2026-03-11T03:00:01"],
    ["an impossible date", "2026-02-31T10:00:00"],
  ])("falls back to the machine's clock for %s", (_, sent) => {
    expect(userNow(sent, now)).toBe(machine);
  });
});

describe("isPastDay", () => {
  it("refuses only the days before today", () => {
    expect(isPastDay("2026-03-09", "2026-03-10T00:01")).toBe(true);
    expect(isPastDay("2026-03-10", "2026-03-10T23:59")).toBe(false);
    expect(isPastDay("2026-03-11", "2026-03-10T23:59")).toBe(false);
  });
});

describe("isPastMinute", () => {
  it("refuses a time even a minute before now, but not the current minute", () => {
    expect(isPastMinute("2026-03-10T14:59", "2026-03-10T15:00")).toBe(true);
    expect(isPastMinute("2026-03-10T15:00", "2026-03-10T15:00")).toBe(false);
    expect(isPastMinute("2026-03-10T15:01", "2026-03-10T15:00")).toBe(false);
  });
});
