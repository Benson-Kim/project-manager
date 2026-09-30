import { describe, expect, it } from "vitest";
import { initialsFrom } from "./initials";

describe("initialsFrom", () => {
  it("uses the first two word chunks", () => {
    expect(initialsFrom("Jane Doe")).toBe("JD");
    expect(initialsFrom("e2e-admin")).toBe("EA");
    expect(initialsFrom("first.last")).toBe("FL");
  });

  it("handles single-chunk and empty names", () => {
    expect(initialsFrom("viewer")).toBe("V");
    expect(initialsFrom("")).toBe("");
    expect(initialsFrom("  ")).toBe("");
  });
});
