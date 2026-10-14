import { describe, expect, it } from "vitest";
import { meetingDateFilter, meetingTimes } from "../schemas/meeting-display";

describe("meetingTimes", () => {
  it("shows the start and end as a range", () => {
    expect(meetingTimes("09:00", "10:30")).toBe("09:00–10:30");
  });

  it("shows one time alone", () => {
    expect(meetingTimes("09:00", null)).toBe("09:00");
    expect(meetingTimes(null, "10:30")).toBe("–10:30");
  });

  it("shows nothing for no times, or Access's 00:00–00:00 pair", () => {
    expect(meetingTimes(null, null)).toBe("");
    expect(meetingTimes("00:00", "00:00")).toBe("");
    expect(meetingTimes("00:00", "01:00")).toBe("00:00–01:00");
  });
});

describe("meetingDateFilter", () => {
  it("reads a YYYY-MM-DD day as midnight UTC", () => {
    expect(meetingDateFilter("2024-12-17")).toEqual(new Date("2024-12-17T00:00:00Z"));
  });

  it("ignores a missing or malformed value", () => {
    expect(meetingDateFilter(undefined)).toBeNull();
    expect(meetingDateFilter("")).toBeNull();
    expect(meetingDateFilter("17/12/2024")).toBeNull();
    expect(meetingDateFilter("2024-13-45")).toBeNull();
    expect(meetingDateFilter("2024-12-17' OR 1=1")).toBeNull();
  });
});
