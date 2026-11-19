import { describe, expect, it } from "vitest";
import { labelPoint, orthogonalPoints, pathOf, routeBetween } from "../connector-route";

const box = (x: number, y: number, width = 100, height = 80) => ({ x, y, width, height });
const at = (x: number, y: number) => ({ x, y });

const isOrthogonal = (points: { x: number; y: number }[]) =>
  points.every((p, i) => i === 0 || p.x === points[i - 1]!.x || p.y === points[i - 1]!.y);

describe("routeBetween", () => {
  it("joins boxes whose centres line up with one straight line", () => {
    expect(routeBetween(box(0, 0), box(300, 0))).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
    expect(routeBetween(box(300, 0), box(0, 0))).toEqual({
      sourceSide: "left",
      targetSide: "right",
    });
    expect(routeBetween(box(0, 0), box(0, 300))).toEqual({
      sourceSide: "bottom",
      targetSide: "top",
    });
    expect(routeBetween(box(0, 300), box(0, 0))).toEqual({
      sourceSide: "top",
      targetSide: "bottom",
    });
  });

  it("lines up boxes of different sizes by their centres", () => {
    expect(routeBetween(box(0, 22, 36, 36), box(200, 0))).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
  });

  it("uses one right angle when the ends do not line up, entering along the longer leg", () => {
    expect(routeBetween(box(0, 0), box(400, 200))).toEqual({
      sourceSide: "bottom",
      targetSide: "left",
    });
    expect(routeBetween(box(0, 0), box(200, 400))).toEqual({
      sourceSide: "right",
      targetSide: "top",
    });
    expect(routeBetween(box(400, 200), box(0, 0))).toEqual({
      sourceSide: "top",
      targetSide: "right",
    });
  });

  it("keeps a right angle already chosen", () => {
    const chosen = { sourceSide: "right", targetSide: "top" } as const;
    expect(routeBetween(box(0, 0), box(400, 200), chosen)).toEqual(chosen);
  });

  it("uses facing sides when the boxes sit side by side but slightly off line", () => {
    expect(routeBetween(box(0, 0), box(300, 30))).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
    expect(routeBetween(box(0, 0), box(30, 300))).toEqual({
      sourceSide: "bottom",
      targetSide: "top",
    });
  });

  it("leaves overlapping boxes alone", () => {
    expect(routeBetween(box(0, 0), box(20, 20))).toBeNull();
  });
});

describe("orthogonalPoints", () => {
  it("draws one straight run when the ends line up", () => {
    expect(orthogonalPoints(at(0, 10), "right", at(200, 10), "left")).toEqual([
      at(0, 10),
      at(200, 10),
    ]);
    expect(orthogonalPoints(at(5, 0), "bottom", at(5, 90), "top")).toEqual([at(5, 0), at(5, 90)]);
  });

  it("bends twice, half way across, between facing sides that do not line up", () => {
    expect(orthogonalPoints(at(0, 0), "right", at(200, 100), "left", 10)).toEqual([
      at(0, 0),
      at(100, 0),
      at(100, 100),
      at(200, 100),
    ]);
    expect(orthogonalPoints(at(0, 0), "bottom", at(100, 200), "top")).toEqual([
      at(0, 0),
      at(0, 100),
      at(100, 100),
      at(100, 200),
    ]);
  });

  it("bends once from a level side into an upright side", () => {
    expect(orthogonalPoints(at(0, 0), "right", at(200, 100), "top")).toEqual([
      at(0, 0),
      at(200, 0),
      at(200, 100),
    ]);
  });

  it("runs clear of both boxes and back between them when the target lies behind", () => {
    const points = orthogonalPoints(at(100, 0), "right", at(0, 40), "left", 10);
    expect(points).toEqual([
      at(100, 0),
      at(110, 0),
      at(110, 20),
      at(-10, 20),
      at(-10, 40),
      at(0, 40),
    ]);
    expect(isOrthogonal(points)).toBe(true);
  });

  it("goes round the outer end when both ends use the same side", () => {
    expect(orthogonalPoints(at(100, 0), "right", at(60, 40), "right", 10)).toEqual([
      at(100, 0),
      at(110, 0),
      at(110, 40),
      at(60, 40),
    ]);
    expect(orthogonalPoints(at(30, 0), "left", at(0, 40), "left", 10)).toEqual([
      at(30, 0),
      at(-10, 0),
      at(-10, 40),
      at(0, 40),
    ]);
  });

  it("only ever runs level or upright", () => {
    const sides = ["top", "right", "bottom", "left"] as const;
    for (const fromSide of sides) {
      for (const toSide of sides) {
        for (const to of [at(150, 90), at(-150, 90), at(150, -90), at(-150, -90), at(0, 90)]) {
          expect(isOrthogonal(orthogonalPoints(at(0, 0), fromSide, to, toSide, 12))).toBe(true);
        }
      }
    }
  });
});

describe("labelPoint", () => {
  it("sits half way along the middle run", () => {
    expect(labelPoint([at(0, 0), at(100, 0)])).toEqual(at(50, 0));
    expect(labelPoint([at(0, 0), at(50, 0), at(50, 80), at(100, 80)])).toEqual(at(50, 40));
    expect(labelPoint([at(0, 0), at(100, 0), at(100, 80)])).toEqual(at(50, 0));
  });
});

describe("pathOf", () => {
  it("writes straight runs only, no curves", () => {
    expect(pathOf([at(0, 0), at(10.256, 0), at(10.256, 5)])).toBe("M 0 0 L 10.26 0 L 10.26 5");
  });
});
