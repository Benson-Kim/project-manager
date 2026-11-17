import { describe, expect, it } from "vitest";
import { fullscreenLabel } from "../components/use-fullscreen";

describe("fullscreenLabel", () => {
  it("offers full screen while the view is not full screen", () => {
    expect(fullscreenLabel(false)).toBe("Full screen");
  });

  it("offers to leave while the view is full screen", () => {
    expect(fullscreenLabel(true)).toBe("Exit full screen");
  });
});
