import { describe, expect, it } from "vitest";
import { dependencyLine } from "../components/wbs-dependency-arrows";

const bar = (left: number, right: number, middle: number) => ({ left, right, middle });

describe("dependencyLine", () => {
  it("joins finish to a later start with one level-upright-level run", () => {
    const line = dependencyLine("FS", bar(0, 100, 10), bar(200, 300, 40));
    expect(line.d).toBe("M 100 10 L 150 10 L 150 40 L 200 40");
    expect(line.head).toBe("M 200 40 l -4 -4 M 200 40 l -4 4");
  });

  it("turns back between the rows when the successor starts before the predecessor ends", () => {
    const line = dependencyLine("FS", bar(0, 100, 10), bar(50, 150, 40));
    expect(line.d).toBe("M 100 10 L 110 10 L 110 25 L 40 25 L 40 40 L 50 40");
  });

  it("goes round the outer start for start to start", () => {
    const line = dependencyLine("SS", bar(100, 200, 10), bar(50, 150, 40));
    expect(line.d).toBe("M 100 10 L 40 10 L 40 40 L 50 40");
    expect(line.head).toBe("M 50 40 l -4 -4 M 50 40 l -4 4");
  });

  it("goes round the outer finish for finish to finish and arrives from the right", () => {
    const line = dependencyLine("FF", bar(0, 100, 10), bar(0, 150, 40));
    expect(line.d).toBe("M 100 10 L 160 10 L 160 40 L 150 40");
    expect(line.head).toBe("M 150 40 l 4 -4 M 150 40 l 4 4");
  });

  it("draws start to finish into the successor's right edge", () => {
    const line = dependencyLine("SF", bar(200, 300, 10), bar(0, 100, 40));
    expect(line.d).toBe("M 200 10 L 150 10 L 150 40 L 100 40");
  });

  it("uses straight runs only", () => {
    for (const type of ["FS", "SS", "FF", "SF"] as const) {
      const { d } = dependencyLine(type, bar(30, 90, 12), bar(10, 70, 64));
      expect(d).toMatch(/^[ML][ML\d .-]*$/);
    }
  });
});
