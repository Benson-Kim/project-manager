import { describe, expect, it } from "vitest";
import { canvasGaps, itemKey } from "../canvas/gaps";
import { filterRepository } from "../canvas/repository-filter";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";

const item = (ItemId: number, Type: CanvasItem["Type"], Title = `Item ${ItemId}`): CanvasItem => ({
  Kind: Type === "WBS" ? "Wbs" : "Requirement",
  ItemId,
  Ref: `${Type}-${ItemId}`,
  Type,
  Title,
  Summary: null,
  Status: null,
  ParentId: null,
  OnCanvas: false,
  X: null,
  Y: null,
  IsCollapsed: false,
});

const link = (
  UpstreamId: number,
  DownstreamId: number,
  LinkStatus: CanvasLink["LinkStatus"] = "Active",
  UpstreamKind: CanvasLink["UpstreamKind"] = "Requirement",
): CanvasLink => ({ UpstreamKind, UpstreamId, DownstreamId, LinkStatus, RowVer: 1 });

const BR = item(1, "BR");
const FR = item(2, "FR");
const TC = item(3, "TC");
const WBS = item(4, "WBS");

describe("canvasGaps", () => {
  it("a test further down covers every item above it", () => {
    const gaps = canvasGaps([BR, FR, TC], [link(1, 2), link(2, 3)]);
    expect(gaps.get(itemKey("Requirement", 1))).toEqual({
      missingTest: false,
      noDownstream: false,
    });
    expect(gaps.get(itemKey("Requirement", 2))).toEqual({
      missingTest: false,
      noDownstream: false,
    });
  });

  it("an item with nothing below it has both gaps, and a test has neither", () => {
    const gaps = canvasGaps([FR, TC], []);
    expect(gaps.get(itemKey("Requirement", 2))).toEqual({ missingTest: true, noDownstream: true });
    expect(gaps.get(itemKey("Requirement", 3))).toEqual({
      missingTest: false,
      noDownstream: false,
    });
  });

  it("a Proposed link closes no gap", () => {
    const gaps = canvasGaps([FR, TC], [link(2, 3, "Proposed")]);
    expect(gaps.get(itemKey("Requirement", 2))?.missingTest).toBe(true);
    expect(gaps.get(itemKey("Requirement", 2))?.noDownstream).toBe(true);
  });

  it("a WBS item and a requirement with the same id stay apart", () => {
    const sameId = item(2, "WBS");
    const gaps = canvasGaps([sameId, FR, TC], [link(2, 3)]);
    expect(gaps.get(itemKey("Wbs", 2))?.noDownstream).toBe(true);
    expect(gaps.get(itemKey("Requirement", 2))?.noDownstream).toBe(false);
  });

  it("a WBS link counts as downstream of that WBS item", () => {
    const gaps = canvasGaps([WBS, TC], [link(4, 3, "Active", "Wbs")]);
    expect(gaps.get(itemKey("Wbs", 4))).toEqual({ missingTest: false, noDownstream: false });
  });
});

describe("filterRepository", () => {
  const items = [BR, FR, TC, item(5, "FR", "Login flow")];
  const gaps = canvasGaps(items, [link(1, 3)]);

  it("filters by type, and All keeps everything", () => {
    const all = { query: "", type: "All", gapsOnly: false } as const;
    expect(filterRepository(items, gaps, all)).toHaveLength(4);
    expect(filterRepository(items, gaps, { ...all, type: "FR" }).map((i) => i.ItemId)).toEqual([
      2, 5,
    ]);
  });

  it("searches the ref and the title, whatever the case", () => {
    const base = { type: "All", gapsOnly: false } as const;
    expect(filterRepository(items, gaps, { ...base, query: " LOGIN " })).toEqual([items[3]]);
    expect(filterRepository(items, gaps, { ...base, query: "br-1" })).toEqual([BR]);
  });

  it("gaps only leaves the items with a gap", () => {
    const shown = filterRepository(items, gaps, { query: "", type: "All", gapsOnly: true });
    expect(shown.map((i) => i.ItemId)).toEqual([2, 5]);
  });
});
