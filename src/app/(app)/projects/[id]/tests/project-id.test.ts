import { describe, expect, it } from "vitest";
import { parseProjectId } from "../project-id";

describe("parseProjectId", () => {
  it("accepts positive integer ids", () => {
    expect(parseProjectId("2")).toBe(2);
    expect(parseProjectId("184")).toBe(184);
  });

  it("rejects non-numeric, fractional, zero and negative ids", () => {
    expect(parseProjectId("abc")).toBeNull();
    expect(parseProjectId("1.5")).toBeNull();
    expect(parseProjectId("0")).toBeNull();
    expect(parseProjectId("-3")).toBeNull();
    expect(parseProjectId("")).toBeNull();
  });
});
