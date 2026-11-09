import { describe, expect, it } from "vitest";
import {
  applyPlacements,
  boardEdges,
  boardNodes,
  CLUSTER_LABEL_RISE,
  clusterLabels,
  collapsibleKeys,
  focusKeys,
  itemConnection,
  linkEnds,
  mergeFlowNodes,
  rollbackPlacements,
  savedMoves,
  settlePlacements,
  unlinkableKeys,
  withHidden,
  type ItemNode,
} from "../canvas/board-model";
import { itemKey } from "../canvas/gaps";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";
import type { LinkRule } from "../schemas/link-rules";

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

const link = (over: Partial<CanvasLink> = {}): CanvasLink => ({
  UpstreamKind: "Requirement",
  UpstreamId: 1,
  DownstreamId: 2,
  LinkStatus: "Active",
  RowVer: 1,
  ...over,
});

describe("canvas board model", () => {
  it("shows on-canvas items only, a saved position beating the auto layout slot", () => {
    const nodes = boardNodes(
      [item({ ItemId: 1, X: 7, Y: 9 }), item({ ItemId: 2 }), item({ ItemId: 3, OnCanvas: false })],
      [link()],
      "Requirement:2",
    );
    expect(nodes.map((node) => node.id)).toEqual(["Requirement:1", "Requirement:2"]);
    expect(nodes[0]?.position).toEqual({ x: 7, y: 9 });
    expect(nodes[1]?.position.x).toBeGreaterThan(0);
    expect(nodes.map((node) => node.selected)).toEqual([false, true]);
  });

  it("keeps an edge only with both ends on the canvas, and dashes a Proposed link", () => {
    const items = [item({ ItemId: 1 }), item({ ItemId: 2 }), item({ ItemId: 3, OnCanvas: false })];
    const edges = boardEdges(items, [
      link(),
      link({ UpstreamId: 3 }),
      link({ UpstreamId: 2, DownstreamId: 1, LinkStatus: "Proposed" }),
    ]);
    expect(edges.map((edge) => edge.id)).toEqual([
      "Requirement:1>Requirement:2",
      "Requirement:2>Requirement:1",
    ]);
    expect(edges[0]?.style).toBeUndefined();
    expect(edges[1]?.style?.strokeDasharray).toBeTruthy();
  });

  it("does not take a WBS item and a requirement with the same id for one node", () => {
    const edges = boardEdges(
      [item({ ItemId: 1, Kind: "Wbs", Type: "WBS" }), item({ ItemId: 2 })],
      [link({ UpstreamKind: "Wbs" })],
    );
    expect(edges[0]?.source).toBe("Wbs:1");
  });

  it("carries each link on its edge, so removing it sends that link's RowVer", () => {
    const saved = link({ RowVer: 2001 });
    const [edge] = boardEdges([item({ ItemId: 1 }), item({ ItemId: 2 })], [saved]);
    expect(edge?.data?.link).toBe(saved);
  });

  it("lays placements over the server's items and leaves the others alone", () => {
    const placement = { OnCanvas: true, X: 5, Y: 6, IsCollapsed: true };
    const [first, second] = applyPlacements(
      [item({ ItemId: 1, OnCanvas: false }), item({ ItemId: 2 })],
      new Map([["Requirement:1", placement]]),
    );
    expect(first).toMatchObject(placement);
    expect(second?.X).toBeNull();
  });

  it("keeps a dragged node in place and what the flow measured when data arrives", () => {
    const flow = (over: Partial<ItemNode>): ItemNode => ({
      id: "Requirement:1",
      type: "item",
      position: { x: 0, y: 0 },
      data: { item: item({ ItemId: 1 }) },
      ...over,
    });
    const measured = { width: 240, height: 150 };
    const dragged = flow({ position: { x: 40, y: 50 }, dragging: true, measured });
    const [merged] = mergeFlowNodes([flow({ position: { x: 1, y: 2 } })], [dragged]);
    expect(merged?.position).toEqual({ x: 40, y: 50 });
    expect(merged?.measured).toEqual(measured);

    const [settled] = mergeFlowNodes(
      [flow({ position: { x: 1, y: 2 } })],
      [flow({ position: { x: 40, y: 50 }, measured })],
    );
    expect(settled?.position).toEqual({ x: 1, y: 2 });
  });

  it("rounds a move, keeps the collapsed flag, and skips an unchanged or unknown node", () => {
    const moves = savedMoves(
      [
        { id: "Requirement:1", x: 10.4, y: 20.6 },
        { id: "Requirement:2", x: 3, y: 4 },
        { id: "Requirement:9", x: 1, y: 1 },
      ],
      [item({ ItemId: 1, IsCollapsed: true }), item({ ItemId: 2, X: 3, Y: 4 })],
    );
    expect(moves).toEqual([{ kind: "Requirement", itemId: 1, x: 10, y: 21, isCollapsed: true }]);
  });

  it("saves no move for an item that left the canvas before the save ran", () => {
    const gone = item({ ItemId: 1, OnCanvas: false });
    expect(savedMoves([{ id: itemKey("Requirement", 1), x: 5, y: 5 }], [gone])).toEqual([]);
  });

  it("takes back a refused write and leaves a later write alone", () => {
    const placed = (x: number) => ({ OnCanvas: true, X: x, Y: x, IsCollapsed: false });
    const [old, refused, later] = [placed(1), placed(2), placed(3)];
    const changes = new Map([
      ["a", refused],
      ["b", refused],
      ["c", refused],
    ]);
    const current = new Map([
      ["a", refused],
      ["b", later],
      ["c", refused],
    ]);
    const after = rollbackPlacements(current, changes, new Map([["a", old]]));
    expect([...after]).toEqual([
      ["a", old],
      ["b", later],
    ]);
  });

  it("drops a local placement once the server has moved that node, and keeps the rest", () => {
    const placed = { OnCanvas: true, X: 10, Y: 20, IsCollapsed: false };
    const kept = { OnCanvas: true, X: 30, Y: 40, IsCollapsed: false };
    const keyA = itemKey("Requirement", 1),
      keyB = itemKey("Requirement", 2);
    const overlay = new Map([
      [keyA, placed],
      [keyB, kept],
    ]);
    const before = [item({ ItemId: 1 }), item({ ItemId: 2 })];
    const after = [item({ ItemId: 1, X: 500, Y: 600 }), item({ ItemId: 2 })];
    const settled = settlePlacements(overlay, before, after);
    expect([...settled]).toEqual([[keyB, kept]]);
    expect(settled.get(keyB)).toBe(kept);
    expect(overlay.size).toBe(2);
  });

  it("drops a local placement when the server collapses, hides or removes that node", () => {
    const overlay = new Map([
      [itemKey("Requirement", 1), { OnCanvas: true, X: 1, Y: 1, IsCollapsed: false }],
      [itemKey("Requirement", 2), { OnCanvas: true, X: 2, Y: 2, IsCollapsed: false }],
      [itemKey("Requirement", 3), { OnCanvas: true, X: 3, Y: 3, IsCollapsed: false }],
    ]);
    const before = [item({ ItemId: 1 }), item({ ItemId: 2 }), item({ ItemId: 3 })];
    const after = [item({ ItemId: 1, IsCollapsed: true }), item({ ItemId: 2, OnCanvas: false })];
    expect(settlePlacements(overlay, before, after).size).toBe(0);
  });

  it("keeps the same map when the server left every overlaid node where it was", () => {
    const overlay = new Map([
      [itemKey("Requirement", 1), { OnCanvas: true, X: 5, Y: 5, IsCollapsed: false }],
    ]);
    const before = [item({ ItemId: 1 }), item({ ItemId: 2 })];
    const after = [item({ ItemId: 1 }), item({ ItemId: 2, X: 9, Y: 9 })];
    expect(settlePlacements(overlay, before, after)).toBe(overlay);
  });
});

describe("canvas connections", () => {
  const rules: LinkRule[] = [
    { downstreamType: "FR", upstreamType: "BR" },
    { downstreamType: "FR", upstreamType: "FR" },
    { downstreamType: "FR", upstreamType: "WBS" },
  ];
  const br = item({ ItemId: 1, Type: "BR" });
  const fr = item({ ItemId: 2, Type: "FR" });
  const wbs = item({ ItemId: 1, Kind: "Wbs", Type: "WBS" });
  const items = [br, fr, wbs];
  const key = (row: CanvasItem) => itemKey(row.Kind, row.ItemId);

  it("connects a requirement or a WBS item to a requirement the rules allow", () => {
    expect(itemConnection(items, [], rules, key(br), key(fr))).toEqual({ up: br, down: fr });
    expect(itemConnection(items, [], rules, key(wbs), key(fr))).toEqual({ up: wbs, down: fr });
  });

  it("refuses a pair the rules leave out, a WBS target and a link to itself", () => {
    expect(itemConnection(items, [], rules, key(fr), key(br))).toBeNull();
    expect(itemConnection(items, [], rules, key(br), key(wbs))).toBeNull();
    expect(itemConnection(items, [], rules, key(fr), key(fr))).toBeNull();
  });

  it("refuses a link that exists, telling a WBS item from a requirement with the same id", () => {
    const fromBr = link({ UpstreamId: 1, DownstreamId: 2 });
    const fromWbs = link({ UpstreamKind: "Wbs", UpstreamId: 1, DownstreamId: 2 });
    expect(itemConnection(items, [fromBr], rules, key(br), key(fr))).toBeNull();
    expect(itemConnection(items, [fromWbs], rules, key(br), key(fr))).toEqual({ up: br, down: fr });
  });

  it("refuses an end that is not on the canvas", () => {
    const hidden = { ...fr, OnCanvas: false };
    expect(itemConnection([br, hidden], [], rules, key(br), key(fr))).toBeNull();
  });
});

describe("canvas link targets", () => {
  const keys = ["Requirement:1", "Requirement:2", "Requirement:3"];
  const canLink = (sourceKey: string, targetKey: string) =>
    sourceKey === "Requirement:1" && targetKey === "Requirement:2";

  it("dims nothing while no link is being drawn", () => {
    expect(unlinkableKeys(keys, null, canLink).size).toBe(0);
  });

  it("dims what a drag from the downstream handle cannot reach, never its start", () => {
    const start = { key: "Requirement:1", fromDownstream: true };
    expect([...unlinkableKeys(keys, start, canLink)]).toEqual(["Requirement:3"]);
  });

  it("reads a drag from the upstream handle the other way round", () => {
    const start = { key: "Requirement:2", fromDownstream: false };
    expect([...unlinkableKeys(keys, start, canLink)]).toEqual(["Requirement:3"]);
  });

  it("puts the upstream end first whichever way the link was started", () => {
    expect(linkEnds({ key: "Wbs:1", fromDownstream: true }, "Requirement:2")).toEqual([
      "Wbs:1",
      "Requirement:2",
    ]);
    expect(linkEnds({ key: "Requirement:2", fromDownstream: false }, "Wbs:1")).toEqual([
      "Wbs:1",
      "Requirement:2",
    ]);
  });
});

describe("canvas folds and focus", () => {
  const wbs = (over: Partial<CanvasItem> & { ItemId: number }) =>
    item({ Kind: "Wbs", Type: "WBS", ...over });

  it("lets a card fold when an on-canvas card sits anywhere below it", () => {
    const keys = collapsibleKeys([
      wbs({ ItemId: 10 }),
      wbs({ ItemId: 11, ParentId: 10 }),
      wbs({ ItemId: 14 }),
      wbs({ ItemId: 13, ParentId: 14, OnCanvas: false }),
      wbs({ ItemId: 12, ParentId: 13 }),
      wbs({ ItemId: 15 }),
      wbs({ ItemId: 16, ParentId: 15, OnCanvas: false }),
    ]);
    expect([...keys].sort()).toEqual(["Wbs:10", "Wbs:14"]);
  });

  it("stops on a parent loop", () => {
    const keys = collapsibleKeys([
      wbs({ ItemId: 1, ParentId: 2 }),
      wbs({ ItemId: 2, ParentId: 1 }),
    ]);
    expect([...keys].sort()).toEqual(["Wbs:1", "Wbs:2"]);
  });

  const items = [1, 2, 3].map((ItemId) => item({ ItemId }));

  it("keeps a lone link removable on its own edge", () => {
    const [edge] = boardEdges(items, [link()]);
    expect(edge?.data).toEqual({ link: link(), count: 1 });
    expect(edge?.label).toBeUndefined();
  });

  it("folds links into one counted edge with no single link", () => {
    const hiddenBy = new Map([["Requirement:3", "Requirement:2"]]);
    const edges = boardEdges(items, [link(), link({ DownstreamId: 3 })], hiddenBy);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ id: "Requirement:1>Requirement:2", label: "2" });
    expect(edges[0]?.data).toEqual({ count: 2 });
  });

  it("counts a single link to a folded card without making it removable", () => {
    const hiddenBy = new Map([["Requirement:3", "Requirement:2"]]);
    const [edge] = boardEdges(items, [link({ DownstreamId: 3 })], hiddenBy);
    expect(edge?.data).toEqual({ count: 1 });
    expect(edge?.label).toBe("1");
  });

  const chain = [
    link(),
    link({ UpstreamId: 2, DownstreamId: 3 }),
    link({ UpstreamId: 3, DownstreamId: 4 }),
  ];

  it("focuses a card with its direct links, or its whole trace", () => {
    expect(focusKeys(null, chain, new Map())).toBeNull();
    const near = focusKeys({ key: "Requirement:2", depth: 1 }, chain, new Map());
    expect([...(near ?? [])].sort()).toEqual(["Requirement:1", "Requirement:2", "Requirement:3"]);
    const all = focusKeys({ key: "Requirement:2", depth: Infinity }, chain, new Map());
    expect(all?.size).toBe(4);
  });

  it("shows a folded neighbour as the card that folds it", () => {
    const hiddenBy = new Map([["Requirement:3", "Requirement:9"]]);
    const near = focusKeys({ key: "Requirement:2", depth: 1 }, chain, hiddenBy);
    expect([...(near ?? [])].sort()).toEqual(["Requirement:1", "Requirement:2", "Requirement:9"]);
  });

  it("hides folded cards and cards outside the focus", () => {
    const nodes = boardNodes(items, [], null);
    const hiddenBy = new Map([["Requirement:2", "Requirement:1"]]);
    expect(withHidden(nodes, hiddenBy, null).map((node) => node.hidden)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      withHidden(nodes, hiddenBy, new Set(["Requirement:1"])).map((node) => node.hidden),
    ).toEqual([false, true, true]);
  });
});

describe("canvas cluster labels", () => {
  it("labels each WBS cluster above its top-left shown card", () => {
    const items = [
      item({ Kind: "Wbs", ItemId: 1, Ref: "1", Title: "Build", Type: "WBS", OnCanvas: false }),
      item({ ItemId: 2, OnCanvas: true, X: 100, Y: 200 }),
      item({ ItemId: 3, OnCanvas: true, X: 40, Y: 260 }),
      item({ ItemId: 4, OnCanvas: true, X: 0, Y: 0 }),
    ];
    const clusters = new Map<string, string | null>([
      ["Requirement:2", "Wbs:1"],
      ["Requirement:3", "Wbs:1"],
      ["Requirement:4", null],
    ]);
    const nodes = boardNodes(items, [], null);
    expect(clusterLabels(items, nodes, clusters)).toEqual([
      { key: "Wbs:1", text: "1 Build", x: 40, y: 200 - CLUSTER_LABEL_RISE },
    ]);
    const folded = withHidden(nodes, new Map([["Requirement:3", "Requirement:2"]]), null);
    expect(clusterLabels(items, folded, clusters)).toEqual([
      { key: "Wbs:1", text: "1 Build", x: 100, y: 200 - CLUSTER_LABEL_RISE },
    ]);
  });
});
