import { describe, expect, it } from "vitest";
import { shiftIntoView } from "../popover-placement";

describe("shiftIntoView (menu panel on a narrow window)", () => {
  it.each([
    ["inside the window", 40, 232, 360, 0],
    ["past the right edge", 226, 418, 360, -66],
    ["past the left edge", -66, 126, 360, 74],
    ["touching the margin", 8, 352, 360, 0],
  ])("%s: %i..%i in %i moves %i", (_case, left, right, width, shift) => {
    expect(shiftIntoView(left, right, width)).toBe(shift);
  });

  it("keeps the left edge in view when the panel is wider than the window", () => {
    expect(shiftIntoView(100, 500, 360)).toBe(-92);
  });
});
