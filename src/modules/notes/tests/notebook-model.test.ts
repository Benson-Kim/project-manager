import { describe, expect, it } from "vitest";
import { groupPages, stripKeyTarget, swapInOrder } from "../notebook-model";
import type { NoteSectionRow, NoteTabRow } from "../schemas/note";

function section(id: number, sortOrder: number): NoteSectionRow {
  return { NoteSectionId: id, NoteId: 4, Title: `Tab ${id}`, SortOrder: sortOrder, RowVer: id };
}

function page(id: number, sectionId: number | null): NoteTabRow {
  return {
    NoteTabId: id,
    NoteId: 4,
    NoteSectionId: sectionId,
    ProjectId: 2,
    Title: `Page ${id}`,
    Content: null,
    SortOrder: id,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: id,
  };
}

describe("notebook model", () => {
  it("keeps a notebook without tabs as one group of every page", () => {
    const pages = [page(1, null), page(2, null)];
    expect(groupPages([], pages)).toEqual([{ section: null, pages }]);
    expect(groupPages([], [])).toEqual([{ section: null, pages: [] }]);
  });

  it("groups pages under their tabs, in tab order and page order", () => {
    const a = section(10, 1);
    const b = section(20, 2);
    const groups = groupPages([b, a], [page(1, 10), page(2, 20), page(3, 10)]);
    expect(groups.map((g) => g.section?.NoteSectionId)).toEqual([20, 10]);
    expect(groups.map((g) => g.pages.map((p) => p.NoteTabId))).toEqual([[2], [1, 3]]);
  });

  it("swaps two entries of an order and leaves the rest in place", () => {
    const order = [
      { id: 1, rowVer: 11 },
      { id: 2, rowVer: 12 },
      { id: 3, rowVer: 13 },
    ];
    expect(swapInOrder(order, 1, 3).map((e) => e.id)).toEqual([3, 2, 1]);
    expect(order.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(swapInOrder(order, 1, 9)).toEqual(order);
    expect(swapInOrder(order, 1, 9)).not.toBe(order);
  });

  it("moves through a tab strip with wrapping arrows, Home and End", () => {
    expect(stripKeyTarget("ArrowRight", 2, 3)).toBe(0);
    expect(stripKeyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(stripKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(stripKeyTarget("Home", 2, 3)).toBe(0);
    expect(stripKeyTarget("End", 0, 3)).toBe(2);
    expect(stripKeyTarget("Enter", 1, 3)).toBeNull();
    expect(stripKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });
});
