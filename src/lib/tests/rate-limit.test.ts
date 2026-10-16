import { afterEach, describe, expect, it } from "vitest";
import { limitFor, resetRateLimits, takeSlot, takeUserSlot } from "../rate-limit";

describe("rate limits (ADR-0031)", () => {
  const configured = process.env.RATE_LIMIT_EXPORTS_PER_MINUTE;
  afterEach(() => {
    resetRateLimits();
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = configured;
  });

  it("counts a fixed window of one minute per key", () => {
    // A minute boundary, so the retry-after arithmetic is exact.
    const start = Math.ceil(1_700_000_000_000 / 60_000) * 60_000;
    expect(takeSlot("k", 2, start)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(takeSlot("k", 2, start + 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    const third = takeSlot("k", 2, start + 10_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(50);
    expect(takeSlot("other", 2, start + 10_000).allowed).toBe(true);
    expect(takeSlot("k", 2, start + 60_000).allowed).toBe(true);
  });

  it("is off at 0", () => {
    for (let i = 0; i < 5; i++) expect(takeSlot("k", 0).allowed).toBe(true);
  });

  it("reads limits from the environment and falls back on nonsense", () => {
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "0";
    expect(limitFor("exports")).toBe(0);
    delete process.env.RATE_LIMIT_EXPORTS_PER_MINUTE;
    expect(limitFor("exports")).toBe(20);
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "3";
    expect(limitFor("exports")).toBe(3);
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "many";
    expect(limitFor("exports")).toBe(20);
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "-1";
    expect(limitFor("exports")).toBe(20);
  });

  it("keys a kind by user", () => {
    process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "1";
    const now = 1_700_000_000_000;
    expect(takeUserSlot("exports", 1, now).allowed).toBe(true);
    expect(takeUserSlot("exports", 1, now).allowed).toBe(false);
    expect(takeUserSlot("exports", 2, now).allowed).toBe(true);
  });
});
