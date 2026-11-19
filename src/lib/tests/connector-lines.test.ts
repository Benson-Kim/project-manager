import { describe, expect, it } from "vitest";
import {
  anchorOn,
  crossings,
  labelPoint,
  lineBetween,
  linePath,
  nearestAt,
  pointAt,
} from "../connector-route";

const box = { x: 0, y: 0, width: 100, height: 40 };

describe("anchorOn", () => {
  it("puts each anchor at the middle of its side", () => {
    expect(anchorOn(box, "top")).toEqual({ x: 50, y: 0 });
    expect(anchorOn(box, "right")).toEqual({ x: 100, y: 20 });
    expect(anchorOn(box, "bottom")).toEqual({ x: 50, y: 40 });
    expect(anchorOn(box, "left")).toEqual({ x: 0, y: 20 });
  });
});

describe("lineBetween and linePath", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 200, y: 100 };

  it("draws a straight line as one run", () => {
    const line = lineBetween(from, "right", to, "left", "straight");
    expect(linePath(line)).toBe("M 0 0 L 200 100");
  });

  it("draws an angled line with level and upright runs only", () => {
    const { points } = lineBetween(from, "right", to, "left", "angled", 12);
    for (let i = 1; i < points.length; i++) {
      const level = points[i].y === points[i - 1].y;
      const upright = points[i].x === points[i - 1].x;
      expect(level || upright).toBe(true);
    }
    expect(linePath({ points })).not.toContain("C");
  });

  it("draws a curved line as one cubic that leaves each end along its side", () => {
    const line = lineBetween(from, "right", to, "left", "curved");
    const path = linePath(line);
    expect(path.startsWith("M 0 0 C ")).toBe(true);
    expect(path.endsWith(" 200 100")).toBe(true);
    const [c1, c2] = line.controls!;
    expect(c1.y).toBe(0);
    expect(c1.x).toBeGreaterThan(0);
    expect(c2.y).toBe(100);
    expect(c2.x).toBeLessThan(200);
    expect(line.points[0]).toEqual(from);
    expect(line.points[line.points.length - 1]).toEqual(to);
  });
});

describe("crossings and hops", () => {
  const level = lineBetween({ x: 0, y: 50 }, "right", { x: 100, y: 50 }, "left", "straight");
  const upright = lineBetween({ x: 40, y: 0 }, "bottom", { x: 40, y: 100 }, "top", "straight");

  it("finds where two lines cross", () => {
    expect(crossings(level, [upright])).toEqual([{ x: 40, y: 50 }]);
  });

  it("ignores lines that only meet at an end", () => {
    const touching = lineBetween({ x: 100, y: 50 }, "right", { x: 150, y: 50 }, "left", "straight");
    expect(crossings(level, [touching])).toEqual([]);
  });

  it("jumps over a crossing with a small arc", () => {
    const path = linePath(level, crossings(level, [upright]));
    expect(path).toBe("M 0 50 L 35 50 A 5 5 0 0 1 45 50 L 100 50");
  });

  it("never hops on a curved line", () => {
    const curve = lineBetween({ x: 0, y: 50 }, "right", { x: 100, y: 60 }, "left", "curved");
    expect(linePath(curve, [{ x: 40, y: 50 }])).not.toContain("A ");
  });
});

describe("points along a line", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("finds the point a fraction of the way along", () => {
    expect(pointAt(points, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(points, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAt(points, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAt(points, 2)).toEqual({ x: 100, y: 100 });
  });

  it("finds how far along the nearest point lies", () => {
    expect(nearestAt(points, { x: 50, y: 10 })).toBeCloseTo(0.25);
    expect(nearestAt(points, { x: 130, y: 50 })).toBeCloseTo(0.75);
    expect(nearestAt([{ x: 5, y: 5 }], { x: 0, y: 0 })).toBe(0);
  });

  it("keeps a label on a curved line near its middle", () => {
    const curve = lineBetween({ x: 0, y: 0 }, "right", { x: 200, y: 0 }, "left", "curved");
    expect(labelPoint(curve.points).x).toBeGreaterThan(80);
    expect(labelPoint(curve.points).x).toBeLessThan(120);
  });
});
