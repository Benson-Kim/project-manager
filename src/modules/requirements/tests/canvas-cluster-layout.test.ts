import { describe, expect, it } from "vitest";
import { layoutClusters } from "../canvas/cluster-layout";
import { layoutCanvas, NODE_HEIGHT } from "../canvas/layout";
import { canvasClusters } from "../canvas/scale";
import { titleMatches } from "../canvas/title-match";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";

const item = (over: Partial<CanvasItem> & { ItemId: number }): CanvasItem => ({
  Kind: "Requirement",
  Ref: `FR-${over.ItemId}`,
  Type: "FR",
  Title: "Title",
  Summary: null,
  Status: null,
  ParentId: null,
  OnCanvas: true,
  X: null,
  Y: null,
  IsCollapsed: false,
  ...over,
});
const wbs = (over: Partial<CanvasItem> & { ItemId: number }) =>
  item({ Kind: "Wbs", Type: "WBS", Ref: `1.${over.ItemId}`, ...over });
const link = (up: number, down: number, over: Partial<CanvasLink> = {}): CanvasLink => ({
  UpstreamKind: "Requirement",
  UpstreamId: up,
  DownstreamId: down,
  LinkStatus: "Active",
  RowVer: 1,
  ...over,
});

describe("canvas cluster layout", () => {
  const items = [
    wbs({ ItemId: 20 }),
    wbs({ ItemId: 10 }),
    item({ ItemId: 1 }),
    item({ ItemId: 2 }),
    item({ ItemId: 3 }),
    item({ ItemId: 4 }),
  ];
  const links = [
    link(10, 1, { UpstreamKind: "Wbs" }),
    link(1, 2),
    link(20, 3, { UpstreamKind: "Wbs" }),
    link(2, 3),
  ];
  const clusters = canvasClusters(items, links);
  const { points, bands } = layoutClusters(items, links, clusters);

  it("gives one band per cluster in item order, with no cluster last", () => {
    expect(bands.map((band) => band.cluster)).toEqual(["Wbs:20", "Wbs:10", null]);
    expect(points.size).toBe(items.length);
  });

  it("keeps every card inside its own band, and the bands apart", () => {
    for (const band of bands) {
      for (const [key, point] of points) {
        if ((clusters.get(key) ?? null) !== band.cluster) continue;
        expect(point.y).toBeGreaterThanOrEqual(band.top);
        expect(point.y + NODE_HEIGHT).toBeLessThanOrEqual(band.bottom);
      }
    }
    bands.slice(1).forEach((band, index) => {
      expect(band.top).toBeGreaterThan(bands[index].bottom);
    });
  });

  it("lays out each band as auto layout would lay out that cluster alone", () => {
    const alone = layoutCanvas(
      items.filter((each) => clusters.get(`${each.Kind}:${each.ItemId}`) === "Wbs:10"),
      links,
    );
    const shift = points.get("Wbs:10")!.y - alone.get("Wbs:10")!.y;
    for (const [key, point] of alone) {
      expect(points.get(key)).toEqual({ x: point.x, y: point.y + shift });
    }
  });

  it("is empty with no items", () => {
    expect(layoutClusters([], [], new Map())).toEqual({ points: new Map(), bands: [] });
  });
});

describe("canvas title match", () => {
  const items = [
    item({ ItemId: 1, Title: "Export the  register" }),
    wbs({ ItemId: 2, Title: "export the register " }),
    item({ ItemId: 3, Title: "Export the registers" }),
  ];

  it("matches whatever the case and spacing, across both kinds", () => {
    expect(titleMatches("  EXPORT the register", items).map((each) => each.ItemId)).toEqual([1, 2]);
  });

  it("matches nothing for a blank title or a near miss", () => {
    expect(titleMatches("   ", items)).toEqual([]);
    expect(titleMatches("Export register", items)).toEqual([]);
  });
});
