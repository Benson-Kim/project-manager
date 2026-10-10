import { describe, expect, it } from "vitest";
import { localWallClock, parseLocalWallClock } from "../local-time";

describe("wall-clock time for to-do alerts", () => {
  it("formats the browser's local time without a zone", () => {
    const date = new Date(2026, 9, 9, 7, 5, 3); // local 2026-10-09 07:05:03
    expect(localWallClock(date)).toBe("2026-10-09T07:05:03");
  });

  it("reads it back as a Date whose UTC fields hold the wall clock (DATETIME2 as typed)", () => {
    const parsed = parseLocalWallClock("2026-10-09T14:05:00");
    expect(parsed?.toISOString()).toBe("2026-10-09T14:05:00.000Z");
  });

  it("rejects anything that is not a plain wall-clock timestamp", () => {
    expect(parseLocalWallClock(null)).toBeNull();
    expect(parseLocalWallClock("")).toBeNull();
    expect(parseLocalWallClock("2026-10-09T14:05:00Z")).toBeNull();
    expect(parseLocalWallClock("2026-10-09 14:05")).toBeNull();
    expect(parseLocalWallClock("2026-13-40T99:99:99")).toBeNull();
  });
});
