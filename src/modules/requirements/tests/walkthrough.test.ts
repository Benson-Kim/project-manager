import { describe, expect, it } from "vitest";
import { walkthroughLanes, walkthroughSteps } from "../canvas/walkthrough";
import type { CanvasItem, CanvasLink } from "../schemas/canvas";

const item = (id: number, type: CanvasItem["Type"], x = 0, over: Partial<CanvasItem> = {}) =>
  ({
    Kind: type === "WBS" ? "Wbs" : "Requirement",
    ItemId: id,
    Ref: `${type}-${id}`,
    Type: type,
    Title: `Item ${id}`,
    Summary: null,
    Status: null,
    ParentId: null,
    OnCanvas: true,
    X: x,
    Y: 0,
    IsCollapsed: false,
    ...over,
  }) as CanvasItem;

const link = (up: number, down: number, kind: CanvasLink["UpstreamKind"] = "Requirement") =>
  ({
    UpstreamKind: kind,
    UpstreamId: up,
    DownstreamId: down,
    LinkStatus: "Active",
    RowVer: 0,
  }) as CanvasLink;

const ids = (lane: { cards: { item: CanvasItem }[] }) => lane.cards.map((card) => card.item.ItemId);

describe("walkthroughSteps", () => {
  it("counts the longest chain of links from a starting item", () => {
    const items = [item(1, "BR"), item(2, "FR"), item(3, "TC"), item(4, "SR")];
    const steps = walkthroughSteps(items, [link(1, 2), link(2, 3), link(1, 3), link(4, 4)]);
    expect([...steps.values()]).toEqual([0, 1, 2, 0]);
  });

  it("ignores links to items off the walkthrough and survives a loop", () => {
    const items = [item(1, "FR"), item(2, "FR")];
    const steps = walkthroughSteps(items, [link(1, 2), link(2, 1), link(9, 1)]);
    expect(Math.max(...steps.values())).toBeLessThanOrEqual(2);
    expect(steps.size).toBe(2);
  });
});

describe("walkthroughLanes", () => {
  const items = [
    item(3, "TC", 10),
    item(2, "FR", 50),
    item(5, "FR", 5),
    item(1, "BR", 0),
    item(7, "WBS", 0),
    item(8, "NFR", 0, { OnCanvas: false }),
  ];
  const links = [link(1, 2), link(2, 3), link(7, 5, "Wbs")];

  it("gives one lane per type in canvas order, only for items on the canvas", () => {
    const lanes = walkthroughLanes(items, links, "type");
    expect(lanes.map((lane) => lane.label)).toEqual(["WBS", "BR", "FR", "TC"]);
    expect(ids(lanes[2])).toEqual([5, 2]);
    expect(lanes[3].cards[0].step).toBe(2);
  });

  it("orders cards in a lane by step, then by place on the canvas", () => {
    const lanes = walkthroughLanes(
      [item(1, "FR", 90), item(2, "FR", 10), item(3, "FR", 50)],
      [link(1, 3)],
      "type",
    );
    expect(ids(lanes[0])).toEqual([2, 1, 3]);
  });

  it("gives one lane per owner by name, with no owner last", () => {
    const owners = new Map([
      [1, "zoe"],
      [2, "Ann "],
      [3, "Zoe"],
    ]);
    const lanes = walkthroughLanes(items, links, "owner", (row) => owners.get(row.ItemId) ?? null);
    expect(lanes.map((lane) => lane.label)).toEqual(["Ann", "zoe", "Zoe", null]);
    expect(lanes.at(-1)?.key).toBe("owner:");
    expect(ids(lanes.at(-1)!)).toEqual([7, 5]);
  });

  it("returns no lanes for an empty canvas", () => {
    expect(walkthroughLanes([item(1, "BR", 0, { OnCanvas: false })], [], "type")).toEqual([]);
  });
});
