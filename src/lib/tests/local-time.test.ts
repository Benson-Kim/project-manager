import { describe, expect, it } from "vitest";
import {
  isValidTimeZone,
  localWallClock,
  parseLocalWallClock,
  resolveTimeZone,
  wallClockInZone,
} from "../local-time";

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

describe("wall clock in an organisation time zone", () => {
  it("puts an 00:30 local alert on the local day for UTC+3", () => {
    const now = new Date("2026-11-17T21:30:00Z");
    expect(wallClockInZone("Africa/Nairobi", now)?.toISOString()).toBe("2026-11-18T00:30:00.000Z");
  });

  it("matches UTC for UTC and returns null for an unknown zone", () => {
    const now = new Date("2026-11-17T21:30:00Z");
    expect(wallClockInZone("UTC", now)?.toISOString()).toBe("2026-11-17T21:30:00.000Z");
    expect(wallClockInZone("Not/AZone", now)).toBeNull();
  });

  it("applies negative and half-hour offsets", () => {
    const now = new Date("2026-11-17T21:30:00Z");
    expect(wallClockInZone("America/St_Johns", now)?.toISOString()).toBe(
      "2026-11-17T18:00:00.000Z",
    );
    expect(wallClockInZone("Asia/Kolkata", now)?.toISOString()).toBe("2026-11-18T03:00:00.000Z");
  });
});

describe("organisation time zone", () => {
  it("defaults to the PC's zone", () => {
    expect(resolveTimeZone({ system: "America/New_York" })).toBe("America/New_York");
    expect(resolveTimeZone({ override: "  ", system: "Asia/Tokyo" })).toBe("Asia/Tokyo");
  });

  it("uses a valid override", () => {
    expect(resolveTimeZone({ override: "Africa/Nairobi", system: "Asia/Tokyo" })).toBe(
      "Africa/Nairobi",
    );
  });

  it("falls back to the PC's zone and reports an invalid override", () => {
    const seen: string[] = [];
    const zone = resolveTimeZone({
      override: "Not/AZone",
      system: "Asia/Tokyo",
      onInvalidOverride: (v) => seen.push(v),
    });
    expect(zone).toBe("Asia/Tokyo");
    expect(seen).toEqual(["Not/AZone"]);
  });

  it("falls back to UTC when the PC reports no usable zone", () => {
    expect(resolveTimeZone({ system: "" })).toBe("UTC");
    expect(resolveTimeZone({ system: "Bad/Zone" })).toBe("UTC");
  });

  it("validates IANA names", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("nope")).toBe(false);
  });
});
