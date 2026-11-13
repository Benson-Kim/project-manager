import { describe, expect, it } from "vitest";
import { canvasClusters, collapsedView, focusTrace, foldLinks } from "../canvas/scale";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";

const item = (over: Partial<CanvasItem> & { ItemId: number }): CanvasItem => ({
  Kind: "Requirement",
  Ref: String(over.ItemId),
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
  item({ Kind: "Wbs", Type: "WBS", ...over });

const link = (up: number, down: number, over: Partial<CanvasLink> = {}): CanvasLink => ({
  UpstreamKind: "Requirement",
  UpstreamId: up,
  DownstreamId: down,
  LinkStatus: "Active",
  RowVer: 1,
  ...over,
});

describe("canvas collapse by parent", () => {
  it("hides every on-canvas item below a collapsed node, counted on the topmost one", () => {
    const items = [
      item({ ItemId: 1, IsCollapsed: true }),
      item({ ItemId: 2, ParentId: 1, IsCollapsed: true }),
      item({ ItemId: 3, ParentId: 2 }),
      item({ ItemId: 4, ParentId: 3, OnCanvas: false }),
      item({ ItemId: 5 }),
    ];
    const { hiddenBy, hiddenCount } = collapsedView(items);
    expect([...hiddenBy]).toEqual([
      ["Requirement:2", "Requirement:1"],
      ["Requirement:3", "Requirement:1"],
    ]);
    expect(hiddenCount.get("Requirement:1")).toBe(2);
  });

  it("skips an off-canvas parent on the way up, and ignores one marked collapsed", () => {
    const items = [
      item({ ItemId: 1, IsCollapsed: true }),
      item({ ItemId: 2, ParentId: 1, OnCanvas: false, IsCollapsed: true }),
      item({ ItemId: 3, ParentId: 2 }),
      item({ ItemId: 4, ParentId: 9 }),
    ];
    expect([...collapsedView(items).hiddenBy]).toEqual([["Requirement:3", "Requirement:1"]]);
  });

  it("keeps a requirement and a WBS item with the same id apart", () => {
    const items = [wbs({ ItemId: 1, IsCollapsed: true }), item({ ItemId: 2, ParentId: 1 })];
    expect(collapsedView(items).hiddenBy.size).toBe(0);
  });

  it("ends on a parent loop", () => {
    const items = [item({ ItemId: 1, ParentId: 2 }), item({ ItemId: 2, ParentId: 1 })];
    expect(collapsedView(items).hiddenBy.size).toBe(0);
  });

  it("folds links onto the collapsed node, one per pair, none inside the tree", () => {
    const hiddenBy = new Map([
      ["Requirement:2", "Requirement:1"],
      ["Requirement:3", "Requirement:1"],
    ]);
    const links = [link(1, 2), link(2, 3), link(2, 5), link(3, 5, { LinkStatus: "Proposed" })];
    const folded = foldLinks(links, hiddenBy);
    expect(folded.map(({ source, target, links }) => [source, target, links.length])).toEqual([
      ["Requirement:1", "Requirement:5", 2],
    ]);
  });

  it("leaves links alone when nothing is collapsed", () => {
    const links = [link(1, 2, { UpstreamKind: "Wbs" }), link(2, 3)];
    expect(foldLinks(links, new Map()).map(({ source, target }) => `${source}>${target}`)).toEqual([
      "Wbs:1>Requirement:2",
      "Requirement:2>Requirement:3",
    ]);
  });
});

describe("canvas focus trace", () => {
  const links = [
    link(1, 2, { UpstreamKind: "Wbs" }),
    link(2, 3),
    link(3, 4),
    link(2, 5),
    link(6, 3),
  ];
  const sorted = (keys: ReadonlySet<string>) => [...keys].sort();

  it("is the focus with its direct upstream and downstream items by default", () => {
    expect(sorted(focusTrace("Requirement:3", links).keys)).toEqual([
      "Requirement:2",
      "Requirement:3",
      "Requirement:4",
      "Requirement:6",
    ]);
  });

  it("keeps one direction per walk, so a sibling is not a neighbour", () => {
    expect(focusTrace("Requirement:3", links, 2).keys.has("Requirement:5")).toBe(false);
    expect(focusTrace("Requirement:3", links, 2).keys.has("Wbs:1")).toBe(true);
  });

  it("gives the whole trace at Infinity, and the focus alone with no links", () => {
    expect(sorted(focusTrace("Wbs:1", links, Infinity).keys)).toEqual([
      "Requirement:2",
      "Requirement:3",
      "Requirement:4",
      "Requirement:5",
      "Wbs:1",
    ]);
    expect(sorted(focusTrace("Requirement:9", links).keys)).toEqual(["Requirement:9"]);
  });

  it("follows only the links on the trace, not one joining two traced items around the focus", () => {
    const bypass = link(6, 4);
    const all = [...links, bypass];
    const followed = (depth: number) =>
      [...focusTrace("Requirement:3", all, depth).links]
        .map((l) => `${l.UpstreamKind}:${l.UpstreamId}>${l.DownstreamId}`)
        .sort();
    expect(focusTrace("Requirement:3", all).keys.has("Requirement:6")).toBe(true);
    expect(focusTrace("Requirement:3", all).keys.has("Requirement:4")).toBe(true);
    expect(followed(1)).toEqual(["Requirement:2>3", "Requirement:3>4", "Requirement:6>3"]);
    expect(followed(Infinity)).toEqual([
      "Requirement:2>3",
      "Requirement:3>4",
      "Requirement:6>3",
      "Wbs:1>2",
    ]);
  });

  it("follows a link between two items on the same side of the focus", () => {
    const chain = [link(1, 2), link(1, 3), link(2, 3)];
    const followed = (depth: number) => focusTrace("Requirement:1", chain, depth).links.size;
    expect(followed(1)).toBe(2);
    expect(followed(Infinity)).toBe(3);
  });
});

describe("canvas clusters", () => {
  it("files each item under the top-level WBS item it traces to, or none", () => {
    const items = [
      wbs({ ItemId: 10 }),
      wbs({ ItemId: 11, ParentId: 10 }),
      wbs({ ItemId: 20 }),
      item({ ItemId: 1, Type: "BR" }),
      item({ ItemId: 2 }),
      item({ ItemId: 3, ParentId: 2 }),
      item({ ItemId: 4 }),
    ];
    const links = [link(11, 1, { UpstreamKind: "Wbs" }), link(1, 2)];
    expect(Object.fromEntries(canvasClusters(items, links))).toEqual({
      "Wbs:10": "Wbs:10",
      "Wbs:11": "Wbs:10",
      "Wbs:20": "Wbs:20",
      "Requirement:1": "Wbs:10",
      "Requirement:2": "Wbs:10",
      "Requirement:3": "Wbs:10",
      "Requirement:4": null,
    });
  });

  it("takes the nearest WBS item, then the first in item order", () => {
    const items = [
      wbs({ ItemId: 10 }),
      wbs({ ItemId: 20 }),
      wbs({ ItemId: 30 }),
      item({ ItemId: 1 }),
      item({ ItemId: 2 }),
    ];
    const links = [
      link(30, 2, { UpstreamKind: "Wbs" }),
      link(20, 2, { UpstreamKind: "Wbs" }),
      link(10, 1, { UpstreamKind: "Wbs" }),
      link(1, 2),
    ];
    expect(canvasClusters(items, links).get("Requirement:2")).toBe("Wbs:20");
  });

  it("ends on a parent loop and ignores a link to an item it was not sent", () => {
    const items = [wbs({ ItemId: 10, ParentId: 11 }), wbs({ ItemId: 11, ParentId: 10 })];
    const clusters = canvasClusters(items, [link(99, 5)]);
    expect(clusters.get("Wbs:10")).toMatch(/^Wbs:1[01]$/);
  });
});
