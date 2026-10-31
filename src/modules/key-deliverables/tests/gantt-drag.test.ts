import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import { dragDays, laneAt, laneDrop } from "../components/gantt-drag";

function item(id: number, parentId: number | null): WbsItem {
  return {
    id,
    parentId,
    sortOrder: id,
    name: `Item ${id}`,
    requestedDate: null,
    start: null,
    end: null,
    status: null,
    priority: null,
    color: null,
    isMilestone: false,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    budget: null,
    note: null,
    rowVer: id,
  };
}

// 1 > 2 > 3, 1 > 4, and 5 on its own.
const wbs = buildWbs([item(1, null), item(2, 1), item(3, 2), item(4, 1), item(5, null)]);

describe("dragDays", () => {
  it("rounds the pointer's travel to whole days either way", () => {
    expect(dragDays(32, 0)).toBe(0);
    expect(dragDays(32, 15)).toBe(0);
    expect(dragDays(32, 17)).toBe(1);
    expect(dragDays(32, 96)).toBe(3);
    expect(dragDays(12, -40)).toBe(-3);
  });

  it("never answers minus zero", () => {
    expect(Object.is(dragDays(32, -3), 0)).toBe(true);
  });
});

describe("laneAt", () => {
  const lanes = [
    { parentId: 1, top: 0, bottom: 50 },
    { parentId: null, top: 60, bottom: 100 },
  ];

  it("finds the lane by height, top edge in, bottom edge out", () => {
    expect(laneAt(lanes, 0)?.parentId).toBe(1);
    expect(laneAt(lanes, 49)?.parentId).toBe(1);
    expect(laneAt(lanes, 60)?.parentId).toBeNull();
  });

  it("is undefined in the gap between lanes and outside them", () => {
    expect(laneAt(lanes, 55)).toBeUndefined();
    expect(laneAt(lanes, 100)).toBeUndefined();
    expect(laneAt(lanes, -1)).toBeUndefined();
  });
});

describe("laneDrop", () => {
  it("puts the card last under the lane's item", () => {
    expect(laneDrop(wbs, 5, 1)).toEqual({ parentId: 1, position: 3 });
    expect(laneDrop(wbs, 3, 1)).toEqual({ parentId: 1, position: 3 });
  });

  it("takes a card to the top level on a lane without an item", () => {
    expect(laneDrop(wbs, 4, null)).toEqual({ parentId: null, position: 3 });
  });

  it("does nothing on the lane it is already in", () => {
    expect(laneDrop(wbs, 4, 1)).toBeNull();
    expect(laneDrop(wbs, 5, null)).toBeNull();
  });

  it("refuses its own branch and an unknown card", () => {
    expect(laneDrop(wbs, 2, 3)).toBeNull();
    expect(laneDrop(wbs, 99, 1)).toBeNull();
  });
});
