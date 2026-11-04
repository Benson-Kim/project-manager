import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatFileSize, toDateInput } from "../format";

describe("formatDateTime", () => {
  it("formats a moment as YYYY-MM-DD HH:mm in local time", () => {
    // Built from local parts, so the expectation holds in any time zone.
    expect(formatDateTime(new Date(2026, 2, 5, 9, 7, 30))).toBe("2026-03-05 09:07");
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31 23:59");
  });
  it("reads an ISO string", () => {
    const d = new Date("2026-10-28T23:30:00.000Z");
    expect(formatDateTime(d.toISOString())).toBe(formatDateTime(d));
  });
  it("returns an empty string for null, undefined or an invalid date", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("not a date")).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-03-15T00:00:00Z"))).toBe("2026-03-15");
  });
  it("formats an ISO string as YYYY-MM-DD in UTC", () => {
    expect(formatDate("2026-10-28T23:30:00.000Z")).toBe("2026-10-28");
  });
  it("returns an empty string for an invalid date", () => {
    expect(formatDate("not a date")).toBe("");
  });
  it("returns an empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });
  it("returns an empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });
});

describe("toDateInput", () => {
  it("returns YYYY-MM-DD for a Date", () => {
    expect(toDateInput(new Date("2026-06-01T12:00:00Z"))).toBe("2026-06-01");
  });
  it("returns YYYY-MM-DD for an ISO date string", () => {
    expect(toDateInput("2026-06-01")).toBe("2026-06-01");
  });
  it("returns YYYY-MM-DD for an ISO datetime string", () => {
    expect(toDateInput("2026-06-01T12:00:00.000Z")).toBe("2026-06-01");
  });
  it("returns empty string for an empty string", () => {
    expect(toDateInput("")).toBe("");
  });
  it("returns empty string for null", () => {
    expect(toDateInput(null)).toBe("");
  });
  it("returns empty string for undefined", () => {
    expect(toDateInput(undefined)).toBe("");
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [820, "820 bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [14 * 1024 + 300, "14 KB"],
    [2.44 * 1024 * 1024, "2.4 MB"],
    [25 * 1024 * 1024, "25 MB"],
    [3 * 1024 ** 3, "3 GB"],
    [5000 * 1024 ** 3, "5000 GB"],
  ])("%d bytes → %s", (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it.each([null, undefined, -1, Number.NaN])("%s → empty", (value) => {
    expect(formatFileSize(value)).toBe("");
  });
});
