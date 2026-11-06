import { describe, expect, it } from "vitest";
import {
  defaultWbsFor,
  filterCanvases,
  parseWbsFilter,
  pickCanvas,
  wbsFilterParam,
} from "../canvas/canvas-filter";
import type { CanvasSummary } from "../schemas/canvas";

const canvas = (id: number, wbs: number | null): CanvasSummary => ({
  RequirementCanvasId: id,
  Name: `Canvas ${id}`,
  KeyDeliverableId: wbs,
  NodeCount: 0,
  RowVer: 1,
});

describe("canvas WBS filter", () => {
  const canvases = [canvas(1, 10), canvas(2, null), canvas(3, 10), canvas(4, 20)];

  it("reads ?wbs= and writes it back the same", () => {
    for (const raw of ["unfiled", "10"]) {
      expect(wbsFilterParam(parseWbsFilter(raw))).toBe(raw);
    }
    expect(parseWbsFilter("10")).toBe(10);
    expect(wbsFilterParam("all")).toBeNull();
  });

  it("lists every canvas for a missing or unknown value", () => {
    for (const raw of [undefined, "", "abc", "0", "-3", "1.5"]) {
      expect(parseWbsFilter(raw)).toBe("all");
    }
    expect(filterCanvases(canvases, "all")).toEqual(canvases);
  });

  it("keeps only the WBS item's canvases, or the unfiled ones", () => {
    const ids = (list: CanvasSummary[]) => list.map((each) => each.RequirementCanvasId);
    expect(ids(filterCanvases(canvases, 10))).toEqual([1, 3]);
    expect(ids(filterCanvases(canvases, "unfiled"))).toEqual([2]);
    expect(filterCanvases(canvases, 99)).toEqual([]);
  });

  it("shows the asked-for canvas even when the filter leaves it out, else the first listed", () => {
    const listed = filterCanvases(canvases, 10);
    expect(pickCanvas(canvases, listed, "4")?.RequirementCanvasId).toBe(4);
    expect(pickCanvas(canvases, listed, "77")?.RequirementCanvasId).toBe(1);
    expect(pickCanvas(canvases, listed, undefined)?.RequirementCanvasId).toBe(1);
    expect(pickCanvas(canvases, [], undefined)).toBeNull();
  });

  it("starts a new canvas under the WBS item the list is filtered to", () => {
    expect(defaultWbsFor(20)).toBe(20);
    expect(defaultWbsFor("unfiled")).toBeNull();
    expect(defaultWbsFor("all")).toBeNull();
  });
});
