import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  IDLE_TIMEOUT_OPTIONS,
  NEVER_IDLE_TIMEOUT,
  idleTimeoutInput,
  isIdleExpired,
} from "../idle-timeout";

const NOW = 1_800_000_000;

describe("isIdleExpired", () => {
  it("keeps a session idle for exactly the allowed time and ends it one second later", () => {
    expect(isIdleExpired(NOW - 15 * 60, 15, NOW)).toBe(false);
    expect(isIdleExpired(NOW - 15 * 60 - 1, 15, NOW)).toBe(true);
  });

  it("never ends a session when the user chose Never", () => {
    expect(isIdleExpired(NOW - 365 * 24 * 60 * 60, NEVER_IDLE_TIMEOUT, NOW)).toBe(false);
  });

  it("defaults to the 8 hours every user had before", () => {
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(480);
    expect(IDLE_TIMEOUT_OPTIONS).toContain(DEFAULT_IDLE_TIMEOUT_MINUTES);
  });
});

describe("idleTimeoutInput", () => {
  it("accepts only the offered choices", () => {
    expect(idleTimeoutInput.safeParse({ idleTimeoutMinutes: 30 }).success).toBe(true);
    expect(idleTimeoutInput.safeParse({ idleTimeoutMinutes: 0 }).success).toBe(true);
    for (const bad of [-1, 1, 45, 1441, "x", "0", "", null, undefined]) {
      expect(idleTimeoutInput.safeParse({ idleTimeoutMinutes: bad }).success).toBe(false);
    }
  });

  it("offers only values the database CHECK allows (0 or 5..1440)", () => {
    for (const minutes of IDLE_TIMEOUT_OPTIONS) {
      expect(minutes === 0 || (minutes >= 5 && minutes <= 1440)).toBe(true);
    }
  });
});
