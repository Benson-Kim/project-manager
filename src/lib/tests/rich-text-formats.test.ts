import { describe, expect, it } from "vitest";
import {
  CELL_SHADES,
  HIGHLIGHT_COLORS,
  INDENT_MAX,
  TEXT_COLORS,
  indentFromCss,
  indentLevel,
  listStart,
  nearestColor,
  numberingCss,
  parseCssColor,
} from "../rich-text/formats";

describe("parseCssColor", () => {
  it.each([
    ["#f00", [255, 0, 0]],
    ["#1F3864", [31, 56, 100]],
    ["rgb(12, 34, 56)", [12, 34, 56]],
    ["rgba(12,34,56,0.5)", [12, 34, 56]],
    ["Yellow", [255, 255, 0]],
  ])("reads %s", (value, rgb) => {
    expect(parseCssColor(value)).toEqual(rgb);
  });

  it.each(["", "url(x)", "rgb(300, 0, 0)", "#12345", "expression(alert(1))", "var(--x)"])(
    "refuses %s",
    (value) => {
      expect(parseCssColor(value)).toBeNull();
    },
  );
});

describe("nearestColor", () => {
  it.each([
    ["#ff0000", "red"],
    ["#c00000", "red"],
    ["#ffc000", "orange"],
    ["#ffff00", "yellow"],
    ["#00b050", "green"],
    ["#0070c0", "blue"],
    ["#1f3864", "blue"],
    ["#7030a0", "purple"],
    ["#808080", "gray"],
    ["magenta", "purple"],
  ])("maps the text colour %s to %s", (value, name) => {
    expect(nearestColor(value, TEXT_COLORS)).toBe(name);
  });

  it.each(["#000000", "black", "#ffffff", "white", "#1a1a1a", "nonsense", null])(
    "maps %s to automatic (null)",
    (value) => {
      expect(nearestColor(value, TEXT_COLORS)).toBeNull();
    },
  );

  it("falls back to the next family a palette has", () => {
    expect(nearestColor("#ff0000", HIGHLIGHT_COLORS)).toBe("pink");
    expect(nearestColor("#ff69b4", CELL_SHADES)).toBe("purple");
    expect(nearestColor("cyan", HIGHLIGHT_COLORS)).toBe("blue");
  });

  it("keeps a palette name as it is", () => {
    for (const name of TEXT_COLORS) expect(nearestColor(name, TEXT_COLORS)).toBe(name);
    for (const name of HIGHLIGHT_COLORS) expect(nearestColor(name, HIGHLIGHT_COLORS)).toBe(name);
    for (const name of CELL_SHADES) expect(nearestColor(name, CELL_SHADES)).toBe(name);
  });
});

describe("indent", () => {
  it.each([
    ["36pt", 1],
    ["0.5in", 1],
    ["1in", 2],
    ["48px", 1],
    ["2.54cm", 2],
    ["0pt", 0],
    ["1000pt", INDENT_MAX],
    ["-36pt", 0],
    ["calc(1px)", 0],
    [null, 0],
  ])("reads the pasted margin %s as level %s", (value, level) => {
    expect(indentFromCss(value)).toBe(level);
  });

  it.each([
    ["3", 3],
    [String(INDENT_MAX), INDENT_MAX],
    [String(INDENT_MAX + 1), 0],
    ["1.5", 0],
    ["x", 0],
  ])("keeps data-indent %s as %s", (value, level) => {
    expect(indentLevel(value)).toBe(level);
  });
});

describe("numbering", () => {
  it("maps each HTML list type to its CSS style", () => {
    expect(numberingCss("a")).toBe("lower-alpha");
    expect(numberingCss("I")).toBe("upper-roman");
    expect(numberingCss("x")).toBeNull();
  });

  it.each([
    ["3", 3],
    [12, 12],
    ["9999", 9999],
    ["10000", null],
    ["0", null],
    ["2.5", null],
    ["", null],
  ])("keeps the list start %s as %s", (value, start) => {
    expect(listStart(value)).toBe(start);
  });
});
