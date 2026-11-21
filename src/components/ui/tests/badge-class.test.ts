import { describe, expect, it } from "vitest";
import { badgeClass } from "../badge";
import { TONES } from "../tones";

describe("badgeClass", () => {
  it("uses the list colour an Admin set over the built-in vocabulary", () => {
    expect(badgeClass("Completed", "red")).toBe(TONES.red.badge);
  });

  it("falls back to the built-in colour for a known status", () => {
    expect(badgeClass("Completed")).toContain("bg-success");
    expect(badgeClass("In Progress", null)).toContain("bg-accent-soft");
  });

  it("gives unknown and empty values the neutral colour", () => {
    expect(badgeClass("Something else")).toBe(badgeClass(null));
    expect(badgeClass(undefined)).toContain("bg-surface-raised");
  });
});
