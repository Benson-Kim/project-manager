import { describe, expect, it } from "vitest";
import { connectorSpan, dropZoneAt, edgeScroll, isWbsView } from "../components/wbs-diagram-layout";

const box = { left: 100, top: 200, width: 200, height: 100 };

describe("dropZoneAt", () => {
  it("in the top-level row, the left and right edges drop in front and behind", () => {
    expect(dropZoneAt(box, 110, 250, "row")).toBe("before");
    expect(dropZoneAt(box, 290, 250, "row")).toBe("after");
    expect(dropZoneAt(box, 200, 205, "row")).toBe("into");
  });

  it("in a column, the top and bottom edges drop in front and behind", () => {
    expect(dropZoneAt(box, 200, 210, "column")).toBe("before");
    expect(dropZoneAt(box, 200, 290, "column")).toBe("after");
    expect(dropZoneAt(box, 105, 250, "column")).toBe("into");
  });

  it("the project box only takes items", () => {
    expect(dropZoneAt(box, 101, 201, "root")).toBe("into");
  });

  it("does not divide by zero on a box that has not been laid out", () => {
    expect(dropZoneAt({ left: 0, top: 0, width: 0, height: 0 }, 0, 0, "row")).toBe("before");
  });
});

describe("connectorSpan", () => {
  it("runs from the leftmost to the rightmost point, wherever the project box is", () => {
    expect(connectorSpan([300, 100, 500])).toEqual({ left: 100, width: 400 });
    expect(connectorSpan([88, 600])).toEqual({ left: 88, width: 512 });
  });

  it("draws nothing for one point, or points on top of each other", () => {
    expect(connectorSpan([88])).toBeNull();
    expect(connectorSpan([88, 88])).toBeNull();
  });
});

describe("edgeScroll", () => {
  it("scrolls toward an edge the pointer is near, faster the closer it is", () => {
    expect(edgeScroll(500, 0, 1000)).toBe(0);
    expect(edgeScroll(10, 0, 1000)).toBe(-8);
    expect(edgeScroll(0, 0, 1000)).toBe(-10);
    expect(edgeScroll(990, 0, 1000)).toBe(8);
  });

  it("caps the speed once the pointer is past the edge", () => {
    expect(edgeScroll(-400, 0, 1000)).toBe(-20);
    expect(edgeScroll(1400, 0, 1000)).toBe(20);
  });
});

describe("isWbsView", () => {
  it("accepts only the two views", () => {
    expect(isWbsView("wbs")).toBe(true);
    expect(isWbsView("gantt")).toBe(true);
    expect(isWbsView("chart")).toBe(false);
    expect(isWbsView(undefined)).toBe(false);
  });
});
