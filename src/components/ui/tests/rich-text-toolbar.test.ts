import { describe, expect, it } from "vitest";
import {
  FONT_FAMILIES,
  primaryFontFamily,
  rovingIndex,
  withCurrentOption,
} from "../rich-text/toolbar-model";

describe("rovingIndex (ARIA toolbar keys)", () => {
  it.each([
    [0, "ArrowRight", 5, 1],
    [4, "ArrowRight", 5, 0],
    [0, "ArrowLeft", 5, 4],
    [3, "ArrowLeft", 5, 2],
    [3, "Home", 5, 0],
    [1, "End", 5, 4],
  ])("from %i, %s with %i items goes to %i", (current, key, count, next) => {
    expect(rovingIndex(current, key, count)).toBe(next);
  });

  it("ignores other keys and empty toolbars", () => {
    expect(rovingIndex(0, "ArrowDown", 5)).toBeNull();
    expect(rovingIndex(0, "Enter", 5)).toBeNull();
    expect(rovingIndex(0, "ArrowRight", 0)).toBeNull();
  });

  it("starts from the first item when focus is outside the list", () => {
    expect(rovingIndex(-1, "ArrowRight", 3)).toBe(0);
  });
});

describe("font options", () => {
  it.each([
    ["Cambria", "Cambria"],
    ['"Times New Roman", serif', "Times New Roman"],
    ["'Segoe UI'", "Segoe UI"],
    ["Arial Rounded MT Bold", "Arial Rounded MT Bold"],
    [undefined, ""],
    [null, ""],
  ])("primaryFontFamily(%j) is %j", (value, family) => {
    expect(primaryFontFamily(value)).toBe(family);
  });

  it("offers only system fonts", () => {
    expect(FONT_FAMILIES).toEqual([
      "Arial",
      "Calibri",
      "Cambria",
      "Times New Roman",
      "Courier New",
      "Segoe UI",
    ]);
  });

  it("adds the current value when it is not a standard option", () => {
    expect(withCurrentOption(["8pt", "12pt"], "12pt")).toEqual(["8pt", "12pt"]);
    expect(withCurrentOption(["8pt", "12pt"], "")).toEqual(["8pt", "12pt"]);
    expect(withCurrentOption(["8pt", "12pt"], "18.6667px")).toEqual(["8pt", "12pt", "18.6667px"]);
  });
});
