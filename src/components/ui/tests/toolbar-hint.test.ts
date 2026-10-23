import { describe, expect, it } from "vitest";
import { hintPlacement, overHint } from "../rich-text/toolbar-hint";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("toolbar hint placement (ADR-0042)", () => {
  const toolbar = box(20, 100, 320, 100);

  it("sits centred under its control, 4 px below it", () => {
    expect(hintPlacement(box(120, 104, 44, 44), toolbar, 80, 1280)).toEqual({ left: 82, top: 52 });
  });

  it("moves inside the window at the right edge of a 360 px screen", () => {
    // Centred it would end at 382; 8 px from the edge is 352.
    expect(hintPlacement(box(300, 104, 44, 44), toolbar, 120, 360).left).toBe(352 - 120 - 20);
  });

  it("moves inside the window at the left edge", () => {
    expect(hintPlacement(box(4, 104, 44, 44), { ...toolbar, left: 0 }, 120, 360).left).toBe(8);
  });
});

describe("pointer over the hint (WCAG 1.4.13 hoverable)", () => {
  const control = box(100, 100, 44, 44);
  const hint = box(82, 148, 80, 24);

  it.each([
    ["on the control", 120, 120, true],
    ["in the gap between them", 120, 146, true],
    ["on the hint", 90, 160, true],
    ["below the hint", 90, 180, false],
    ["beside the control, within the hint's width", 160, 120, true],
    ["past the hint's right end", 170, 160, false],
  ])("%s", (_case, x, y, over) => {
    expect(overHint(x, y, control, hint)).toBe(over);
  });
});
