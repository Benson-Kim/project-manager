import { describe, expect, it } from "vitest";
import { detachedPlacement, isOnScreen, type Rect } from "../window-placement";

const left: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const right: Rect = { x: 1920, y: 0, width: 2560, height: 1400 };
const main: Rect = { x: 100, y: 80, width: 1280, height: 800 };

describe("isOnScreen", () => {
  it("needs half of the window on one display", () => {
    expect(isOnScreen({ x: 2000, y: 100, width: 1000, height: 700 }, [left, right])).toBe(true);
    expect(isOnScreen({ x: 1600, y: 100, width: 1000, height: 700 }, [left])).toBe(false);
    expect(isOnScreen({ x: 3000, y: 100, width: 800, height: 600 }, [left])).toBe(false);
  });
});

describe("detachedPlacement", () => {
  it("reuses where the last detached window was", () => {
    const saved = { bounds: { x: 2100, y: 50, width: 1600, height: 1000 }, maximized: false };
    expect(
      detachedPlacement({ saved, workAreas: [left, right], mainArea: left, mainBounds: main }),
    ).toEqual(saved);
  });

  it("fills another display when the saved place is gone (second screen unplugged)", () => {
    const saved = { bounds: { x: 2100, y: 50, width: 1600, height: 1000 }, maximized: true };
    const placement = detachedPlacement({
      saved,
      workAreas: [left],
      mainArea: left,
      mainBounds: main,
    });
    expect(placement.maximized).toBe(false);
    expect(isOnScreen(placement.bounds, [left])).toBe(true);
  });

  it("opens maximised on a display other than the main window's", () => {
    expect(
      detachedPlacement({
        saved: null,
        workAreas: [left, right],
        mainArea: left,
        mainBounds: main,
      }),
    ).toEqual({ bounds: right, maximized: true });
    expect(
      detachedPlacement({
        saved: null,
        workAreas: [left, right],
        mainArea: right,
        mainBounds: { ...main, x: 2000 },
      }),
    ).toEqual({ bounds: left, maximized: true });
  });

  it("with one display, cascades beside the main window and stays on it", () => {
    expect(
      detachedPlacement({ saved: null, workAreas: [left], mainArea: left, mainBounds: main }),
    ).toEqual({ bounds: { x: 132, y: 112, width: 1280, height: 800 }, maximized: false });
    const corner = { x: 640, y: 240, width: 1280, height: 800 };
    expect(
      detachedPlacement({ saved: null, workAreas: [left], mainArea: left, mainBounds: corner })
        .bounds,
    ).toEqual({ x: 640, y: 240, width: 1280, height: 800 });
  });
});
