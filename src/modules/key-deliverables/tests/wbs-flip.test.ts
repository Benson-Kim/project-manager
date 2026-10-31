import { describe, expect, it } from "vitest";
import { buildWbs, type WbsItem } from "../schemas/wbs";
import { flipDeltas, flipKey } from "../components/use-flip";

function item(id: number, parentId: number | null, more: Partial<WbsItem> = {}) {
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
    ...more,
  } satisfies WbsItem;
}

describe("flipKey", () => {
  const before = buildWbs([item(1, null), item(2, 1), item(3, 1)]);

  it("stays the same when only names, dates or row versions change", () => {
    const saved = buildWbs([
      item(1, null, { name: "Renamed", rowVer: 9 }),
      item(2, 1, { start: new Date("2026-01-01T00:00:00Z") }),
      item(3, 1),
    ]);
    expect(flipKey(saved, new Set())).toBe(flipKey(before, new Set()));
  });

  it("changes when an item moves to another place or parent", () => {
    const swapped = buildWbs([item(1, null), item(2, 1, { sortOrder: 4 }), item(3, 1)]);
    const outdented = buildWbs([item(1, null), item(2, null), item(3, 1)]);
    expect(flipKey(swapped, new Set())).not.toBe(flipKey(before, new Set()));
    expect(flipKey(outdented, new Set())).not.toBe(flipKey(before, new Set()));
  });

  it("changes when a branch folds, ignoring folds of items that are gone", () => {
    expect(flipKey(before, new Set([1]))).not.toBe(flipKey(before, new Set()));
    expect(flipKey(before, new Set([99]))).toBe(flipKey(before, new Set()));
  });
});

describe("flipDeltas", () => {
  it("gives how far each remaining box moved, skipping new and still boxes", () => {
    const before = new Map([
      ["1", { x: 0, y: 0 }],
      ["2", { x: 100, y: 50 }],
      ["3", { x: 10, y: 10 }],
    ]);
    const now = new Map([
      ["1", { x: 0.4, y: 0 }],
      ["2", { x: 40, y: 80 }],
      ["4", { x: 5, y: 5 }],
    ]);
    expect(flipDeltas(before, now)).toEqual([{ id: "2", dx: 60, dy: -30 }]);
  });
});
