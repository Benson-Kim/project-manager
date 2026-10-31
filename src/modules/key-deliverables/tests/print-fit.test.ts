import { describe, expect, it } from "vitest";
import { PRINT_WIDTH_PX, printZoom } from "../components/use-print-fit";

describe("printZoom", () => {
  it("is the A4 landscape width inside the margins", () => {
    expect(PRINT_WIDTH_PX).toBe(1046);
  });

  it("leaves a chart that fits at its size", () => {
    expect(printZoom(800)).toBe(1);
    expect(printZoom(PRINT_WIDTH_PX)).toBe(1);
  });

  it("shrinks a wider chart to the page, rounding down so it never spills", () => {
    expect(printZoom(2092)).toBe(0.5);
    const zoom = printZoom(3000);
    expect(zoom * 3000).toBeLessThanOrEqual(PRINT_WIDTH_PX);
    expect(zoom).toBeCloseTo(PRINT_WIDTH_PX / 3000, 2);
  });

  it("reads an unmeasured width as fitting", () => {
    expect(printZoom(Number.NaN)).toBe(1);
    expect(printZoom(0)).toBe(1);
  });
});
