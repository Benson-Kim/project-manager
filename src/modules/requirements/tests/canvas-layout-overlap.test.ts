import { describe, expect, it } from "vitest";
import { boardNodes } from "../canvas/board-model";
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

function random(seed: number) {
  let state = seed;
  return (n: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % n;
  };
}

function board(seed: number) {
  const pick = random(seed);
  const items: CanvasItem[] = [];
  for (let id = 1; id <= 4; id += 1) {
    items.push(
      item({
        ItemId: id,
        Kind: "Wbs",
        Type: "WBS",
        Ref: `1.${id}`,
        ParentId: id > 2 ? pick(2) + 1 : null,
      }),
    );
  }
  for (let id = 1; id <= 30; id += 1) {
    items.push(item({ ItemId: id, ParentId: id > 5 && pick(3) === 0 ? pick(id - 1) + 1 : null }));
  }
  const links: CanvasLink[] = [];
  for (let n = 0; n < 45; n += 1) {
    const fromWbs = pick(4) === 0;
    const up = fromWbs ? pick(4) + 1 : pick(30) + 1;
    const down = pick(30) + 1;
    if (!fromWbs && up === down) continue;
    links.push({
      UpstreamKind: fromWbs ? "Wbs" : "Requirement",
      UpstreamId: up,
      DownstreamId: down,
      LinkStatus: "Active",
      RowVer: 1,
    });
  }
  return { items, links };
}

function expectApart(nodes: ReturnType<typeof boardNodes>) {
  for (const [index, a] of nodes.entries()) {
    for (const b of nodes.slice(index + 1)) {
      const apart =
        a.position.x + a.width! <= b.position.x ||
        b.position.x + b.width! <= a.position.x ||
        a.position.y + a.height! <= b.position.y ||
        b.position.y + b.height! <= a.position.y;
      expect(apart, `${a.id} and ${b.id}`).toBe(true);
    }
  }
}

const seeds = Array.from({ length: 40 }, (_, seed) => seed + 1);

describe("auto layout", () => {
  it.each(seeds)("never overlaps two cards (seed %i)", (seed) => {
    const { items, links } = board(seed);
    expectApart(boardNodes(items, links, null));
  });

  it.each(seeds)("keeps laid-out cards off a card moved by hand (seed %i)", (seed) => {
    const { items, links } = board(seed);
    const moved = seed % items.length;
    const { x, y } = boardNodes(items, links, null)[moved].position;
    items[moved] = { ...items[moved], X: x + 20, Y: y + 20 };
    items.push(item({ ItemId: 31 }));
    links.push({
      UpstreamKind: "Requirement",
      UpstreamId: 31,
      DownstreamId: 1,
      LinkStatus: "Active",
      RowVer: 1,
    });
    expectApart(boardNodes(items, links, null));
  });
});
