import { describe, expect, it } from "vitest";
import { sidewaysPercent, sidewaysStartAt, sidewaysThumb, sidewaysTrack } from "../model/sideways";

const view = { start: 0, end: 100 };

describe("sidewaysTrack", () => {
  it("adds one screen either side of the drawing", () => {
    expect(sidewaysTrack({ start: 50, end: 450 }, view)).toEqual({ start: -50, end: 550 });
  });

  it("keeps the screen inside the track when it is scrolled past the drawing", () => {
    expect(sidewaysTrack({ start: 0, end: 50 }, { start: 900, end: 1000 })).toEqual({
      start: -100,
      end: 1000,
    });
  });

  it("gives an empty board one screen either side", () => {
    expect(sidewaysTrack(null, view)).toEqual({ start: -100, end: 200 });
  });
});

describe("sidewaysThumb", () => {
  it("sizes and places the thumb as fractions of the track", () => {
    expect(sidewaysThumb({ start: -100, end: 300 }, view)).toEqual({ offset: 0.25, size: 0.25 });
  });
});

describe("sidewaysStartAt", () => {
  const track = { start: -100, end: 300 };

  it("turns a thumb position into the screen's left edge", () => {
    expect(sidewaysStartAt(track, view, 0.5)).toBe(100);
  });

  it("stops at both ends of the track", () => {
    expect(sidewaysStartAt(track, view, -1)).toBe(-100);
    expect(sidewaysStartAt(track, view, 2)).toBe(200);
  });
});

describe("sidewaysPercent", () => {
  it("is 0 at the left end and 100 at the right", () => {
    const track = { start: -100, end: 300 };
    expect(sidewaysPercent(track, { start: -100, end: 0 })).toBe(0);
    expect(sidewaysPercent(track, { start: 200, end: 300 })).toBe(100);
    expect(sidewaysPercent(track, { start: 50, end: 150 })).toBe(50);
  });
});
