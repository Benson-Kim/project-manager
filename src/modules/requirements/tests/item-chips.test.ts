import { describe, expect, it } from "vitest";
import { badgeLabel } from "../components/canvas/item-chips";

describe("badgeLabel", () => {
  it("joins a requirement's type and number into one token, dropping the dash", () => {
    expect(badgeLabel("FR", "FR-1.1")).toBe("FR1.1");
    expect(badgeLabel("NFR", "NFR-2.3.1")).toBe("NFR2.3.1");
  });

  it("prefixes a WBS code (which carries no type) with its type", () => {
    expect(badgeLabel("WBS", "1.2")).toBe("WBS1.2");
  });

  it("falls back to the bare type when there is no reference", () => {
    expect(badgeLabel("WBS", "")).toBe("WBS");
    expect(badgeLabel("FR", "")).toBe("FR");
  });
});
