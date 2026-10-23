import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP,
  MAX_EDGE_SCROLL,
  edgeScroll,
  exceedsSlop,
  insertionIndex,
  type DragSpan,
} from "../drag/pointer-drag";

describe("exceedsSlop", () => {
  it("treats a press that barely moves as a click, not a drag", () => {
    expect(exceedsSlop(0, 0)).toBe(false);
    expect(exceedsSlop(DRAG_SLOP - 1, 0)).toBe(false);
  });

  it("becomes a drag once the press travels past the slop, in any direction", () => {
    expect(exceedsSlop(DRAG_SLOP, 0)).toBe(true);
    expect(exceedsSlop(0, -DRAG_SLOP)).toBe(true);
    expect(exceedsSlop(4, 4)).toBe(true); // 4² + 4² = 32 ≥ 25
  });

  it("honours a custom slop", () => {
    expect(exceedsSlop(8, 0, 10)).toBe(false);
    expect(exceedsSlop(10, 0, 10)).toBe(true);
  });
});

describe("edgeScroll", () => {
  it("does not scroll while the pointer is away from both edges", () => {
    expect(edgeScroll(200, 100, 500)).toBe(0);
  });

  it("scrolls toward the start near the start edge, and the other way near the end", () => {
    expect(edgeScroll(110, 100, 500)).toBeLessThan(0);
    expect(edgeScroll(490, 100, 500)).toBeGreaterThan(0);
  });

  it("never scrolls faster than the cap, even well past an edge", () => {
    expect(edgeScroll(-1000, 100, 500)).toBe(-MAX_EDGE_SCROLL);
    expect(edgeScroll(5000, 100, 500)).toBe(MAX_EDGE_SCROLL);
  });
});

describe("insertionIndex", () => {
  const spans: DragSpan[] = [
    { start: 0, size: 100 }, // midpoint 50
    { start: 100, size: 100 }, // midpoint 150
    { start: 200, size: 100 }, // midpoint 250
  ];

  it("names a gap between items, always from 0 to the list length", () => {
    expect(insertionIndex(10, spans)).toBe(0); // before the first midpoint
    expect(insertionIndex(120, spans)).toBe(1); // past item 0's midpoint
    expect(insertionIndex(220, spans)).toBe(2); // past item 1's midpoint
    expect(insertionIndex(999, spans)).toBe(3); // past all midpoints
  });

  it("drops at the end of an empty list", () => {
    expect(insertionIndex(0, [])).toBe(0);
  });

  it("drops after an item once the pointer reaches its midpoint", () => {
    expect(insertionIndex(49, spans)).toBe(0);
    expect(insertionIndex(50, spans)).toBe(1);
  });
});
