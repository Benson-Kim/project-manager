import { describe, expect, it } from "vitest";
import {
  LINE_COLOURS,
  PLAIN_STYLE,
  connectorStyleSchema,
  dashFor,
  drawnStyle,
  isPlain,
} from "../connector-style";

const defaults = {
  shape: "angled",
  pattern: "solid",
  startEnd: "none",
  endEnd: "arrow",
  sourceSide: "right",
  targetSide: "left",
} as const;

function luminance(hex: string) {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("connectorStyleSchema", () => {
  const full = {
    shape: "curved",
    pattern: "dashed",
    startEnd: "arrow",
    endEnd: "dot",
    weight: 3,
    colour: "#2563EB",
    attach: "floating",
    sourceSide: "bottom",
    targetSide: "top",
    jumps: true,
  };

  it("accepts a full style and the plain style", () => {
    expect(connectorStyleSchema.parse(full)).toEqual(full);
    expect(connectorStyleSchema.parse(PLAIN_STYLE)).toEqual(PLAIN_STYLE);
  });

  it.each([
    ["shape", "zigzag"],
    ["pattern", "solid; drop table x"],
    ["startEnd", "diamond"],
    ["weight", 0],
    ["weight", 7],
    ["weight", 2.5],
    ["colour", "red"],
    ["colour", "#12345"],
    ["colour", "#1234567"],
    ["colour", "#12345G"],
    ["colour", "url(javascript:alert(1))"],
    ["attach", "glued"],
    ["sourceSide", "middle"],
  ])("refuses %s = %s", (key, value) => {
    expect(connectorStyleSchema.safeParse({ ...full, [key]: value }).success).toBe(false);
  });

  it("refuses keys it does not know", () => {
    expect(connectorStyleSchema.safeParse({ ...full, stroke: "red" }).success).toBe(false);
  });
});

describe("drawnStyle", () => {
  it("fills every unset value from the diagram's defaults", () => {
    expect(drawnStyle(PLAIN_STYLE, defaults)).toEqual({
      ...defaults,
      weight: null,
      colour: null,
      attach: "fixed",
      jumps: false,
    });
    expect(isPlain(PLAIN_STYLE)).toBe(true);
  });

  it("keeps what was set", () => {
    const style = { ...PLAIN_STYLE, shape: "curved" as const, endEnd: "none" as const };
    expect(drawnStyle(style, defaults)).toMatchObject({ shape: "curved", endEnd: "none" });
    expect(isPlain(style)).toBe(false);
  });
});

describe("dashFor", () => {
  it("keeps the usual dash at the default weight", () => {
    expect(dashFor("dashed", null)).toBe("6 4");
    expect(dashFor("solid", 4)).toBeUndefined();
  });

  it("scales dashes and dots with the weight", () => {
    expect(dashFor("dashed", 4)).toBe("12 8");
    expect(dashFor("dotted", 3)).toBe("0 8");
  });
});

describe("LINE_COLOURS", () => {
  it.each(LINE_COLOURS)("%s reads on the light and the dark canvas", (colour) => {
    expect(contrast(colour, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrast(colour, "#18181B")).toBeGreaterThanOrEqual(3);
  });
});
