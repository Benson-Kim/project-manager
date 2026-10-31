import { describe, expect, it } from "vitest";
import {
  requirementIndent,
  requirementOutdent,
  requirementOutline,
  type WbsRequirement,
} from "../schemas/wbs";

/** An item's requirements as an outline, and the quick-add's Tab and Shift+Tab. */

function req(id: number, more: Partial<WbsRequirement> = {}): WbsRequirement {
  return {
    id,
    type: "FR",
    ref: `FR-${id}`,
    text: `R${id}`,
    isMet: false,
    sortOrder: id,
    rowVer: id,
    placeRowVer: id,
    parentId: null,
    moscow: null,
    criteria: null,
    estimateDays: null,
    ownerId: null,
    ownerName: null,
    ...more,
  };
}

// FR-1 > FR-11 > FR-111, FR-1 > FR-12, FR-2; FR-31's parent is not allocated here.
const list = [
  req(1),
  req(12, { parentId: 1 }),
  req(11, { parentId: 1, sortOrder: 0 }),
  req(111, { parentId: 11 }),
  req(2),
  req(31, { parentId: 30 }),
];

describe("requirementOutline", () => {
  it("puts parents before their sub-requirements, siblings by sortOrder, with depth", () => {
    expect(requirementOutline(list).map((e) => [e.requirement.id, e.depth])).toEqual([
      [1, 0],
      [11, 1],
      [111, 2],
      [12, 1],
      [2, 0],
      [31, 0],
    ]);
  });

  it("lists each requirement once when their parents form a loop", () => {
    const loop = [req(21, { parentId: 22 }), req(22, { parentId: 21 })];
    expect(requirementOutline(loop).map((e) => e.requirement.id)).toEqual([21, 22]);
  });
});

describe("requirementIndent", () => {
  it("nests under the last saved requirement at the current level", () => {
    expect(requirementIndent(list, null)).toBe(31);
    expect(requirementIndent(list, 1)).toBe(12);
    expect(requirementIndent(list, 11)).toBe(111);
  });

  it("has nowhere to go under a requirement with no sub-requirements, so Tab moves on", () => {
    expect(requirementIndent(list, 111)).toBeUndefined();
    expect(requirementIndent([], null)).toBeUndefined();
  });

  it("never nests under one the server has not saved yet", () => {
    expect(requirementIndent([req(1), req(-1, { sortOrder: 9 })], null)).toBe(1);
    expect(requirementIndent([req(-1)], null)).toBeUndefined();
  });
});

describe("requirementOutdent", () => {
  it("steps up one level, to the top from a top-level parent", () => {
    expect(requirementOutdent(list, 111)).toBe(11);
    expect(requirementOutdent(list, 11)).toBe(1);
    expect(requirementOutdent(list, 1)).toBeNull();
    // A parent outside this item's list counts as the top.
    expect(requirementOutdent(list, 31)).toBeNull();
  });

  it("has nowhere to go at the top level, so Shift+Tab moves back", () => {
    expect(requirementOutdent(list, null)).toBeUndefined();
  });
});
