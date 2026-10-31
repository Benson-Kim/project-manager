import { describe, expect, it } from "vitest";
import { MIN_BOX_PX, fitHeight, stretchBelow } from "../data-view/fit-height";

/**
 * A list box is as tall as the window allows (`--fit-h`). Filtering a to-do list to one priority
 * shrank the box to its few rows, and clearing the filter left it that short: the shell pads a
 * short page out to the window, and that padding was read as content below the box.
 */
const WINDOW = 900;
const TOP = 200;
const CHROME_BELOW = 60;

describe("fitHeight", () => {
  it("fills the window between what sits above and below a full list", () => {
    const fit = fitHeight({ viewport: WINDOW, top: TOP, below: CHROME_BELOW, stretch: 0 });
    expect(fit).toBe(WINDOW - TOP - CHROME_BELOW);
  });

  it("keeps the same height when a filter leaves a few rows and the shell pads the page out", () => {
    const full = fitHeight({ viewport: WINDOW, top: TOP, below: CHROME_BELOW, stretch: 0 });
    const shortBox = 120;
    const padding = full - shortBox;
    const filtered = fitHeight({
      viewport: WINDOW,
      top: TOP,
      below: CHROME_BELOW + padding,
      stretch: stretchBelow([
        { contentBottom: 1000, childrenBottom: 1000 },
        { contentBottom: 1000, childrenBottom: 1000 - padding },
      ]),
    });
    expect(filtered).toBe(full);
  });

  it("never goes below the minimum, however little room the window leaves", () => {
    expect(fitHeight({ viewport: 300, top: 250, below: 100, stretch: 0 })).toBe(MIN_BOX_PX);
  });
});

describe("stretchBelow", () => {
  it("adds the empty room at the bottom of every ancestor", () => {
    expect(
      stretchBelow([
        { contentBottom: 500, childrenBottom: 480 },
        { contentBottom: 800, childrenBottom: 700 },
      ]),
    ).toBe(120);
  });

  it("reads a scroller whose children run past its end as no room", () => {
    expect(stretchBelow([{ contentBottom: 500, childrenBottom: 900 }])).toBe(0);
  });

  it("skips an ancestor with nothing in the flow", () => {
    expect(stretchBelow([{ contentBottom: 500, childrenBottom: null }])).toBe(0);
  });
});
