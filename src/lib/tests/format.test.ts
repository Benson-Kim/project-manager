import { describe, it, expect } from "vitest";
import { formatDate, toDateInput } from "../format";

describe("formatDate", () => {
  it("formats a Date as medium en-CA", () => {
    expect(formatDate(new Date("2026-03-15T00:00:00Z"))).toBe("Mar 15, 2026");
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
