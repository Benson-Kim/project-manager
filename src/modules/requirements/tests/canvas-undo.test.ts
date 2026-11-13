import { describe, expect, it } from "vitest";
import type { Placement } from "../canvas/board-model";
import { itemKey } from "../canvas/gaps";
import { linkBack, nodesBack, savedLink, stepBack, undoApplies, unlinkBack } from "../canvas/undo";
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

const at = (x: number | null, y: number | null, over: Partial<Placement> = {}): Placement => ({
  OnCanvas: true,
  X: x,
  Y: y,
  IsCollapsed: false,
  ...over,
});

const rules: LinkRule[] = [{ downstreamType: "FR", upstreamType: "BR" }];
const br = item({ ItemId: 1, Type: "BR" });
const fr = item({ ItemId: 2, Type: "FR", X: 10, Y: 20 });
const key = (row: CanvasItem) => itemKey(row.Kind, row.ItemId);

describe("canvas undo: nodes", () => {
  it("remembers where each changed node was, and only the changed ones", () => {
    const step = nodesBack(
      [br, fr],
      new Map([
        [key(br), at(null, null)],
        [key(fr), at(30, 40)],
      ]),
    );
    expect(step).toEqual({ kind: "nodes", before: new Map([[key(fr), at(10, 20)]]) });
  });

  it("remembers a removed node as on the canvas, folded or not", () => {
    const folded = item({ ItemId: 3, X: 5, Y: 6, IsCollapsed: true });
    const step = nodesBack([folded], new Map([[key(folded), at(null, null, { OnCanvas: false })]]));
    expect(step).toEqual({
      kind: "nodes",
      before: new Map([[key(folded), at(5, 6, { IsCollapsed: true })]]),
    });
  });

  it("remembers nothing for a write that changes nothing", () => {
    expect(nodesBack([fr], new Map([[key(fr), at(10, 20)]]))).toBeNull();
    expect(nodesBack([fr], new Map())).toBeNull();
  });

  it("applies while one of its nodes is still listed", () => {
    const step = nodesBack([fr], new Map([[key(fr), at(30, 40)]]))!;
    expect(undoApplies(step, [br, fr], [], rules)).toBe(true);
    expect(undoApplies(step, [br], [], rules)).toBe(false);
  });
});

describe("canvas undo: links", () => {
  it("takes a new link away again while it is saved", () => {
    const step = linkBack(br, fr);
    expect(step).toEqual({ kind: "unlink", upKey: key(br), downId: fr.ItemId });
    expect(undoApplies(step, [br, fr], [link()], rules)).toBe(true);
    expect(undoApplies(step, [br, fr], [], rules)).toBe(false);
  });

  it("finds the saved link by its two ends", () => {
    const saved = link({ RowVer: 7 });
    expect(savedLink([link({ DownstreamId: 9 }), saved], key(br), fr.ItemId)).toBe(saved);
    expect(savedLink([saved], itemKey("Wbs", 1), fr.ItemId)).toBeUndefined();
  });

  it("brings a removed link back while the rules and the board allow it", () => {
    const step = unlinkBack(link());
    expect(step).toEqual({ kind: "relink", upKey: key(br), downKey: key(fr) });
    expect(undoApplies(step, [br, fr], [], rules)).toBe(true);
    expect(undoApplies(step, [br, fr], [link()], rules)).toBe(false);
    expect(undoApplies(step, [br, { ...fr, OnCanvas: false }], [], rules)).toBe(false);
    expect(undoApplies(step, [br, fr], [], [])).toBe(false);
  });

  it("brings back a link from a WBS item", () => {
    const wbs = item({ ItemId: 4, Kind: "Wbs", Type: "WBS" });
    const step = unlinkBack(link({ UpstreamKind: "Wbs", UpstreamId: 4 }));
    expect(step).toEqual({ kind: "relink", upKey: key(wbs), downKey: key(fr) });
    expect(undoApplies(step, [wbs, fr], [], [{ downstreamType: "FR", upstreamType: "WBS" }])).toBe(
      true,
    );
  });
});

describe("canvas redo: the step back of an undo", () => {
  it("puts moved nodes back where the undo found them", () => {
    const undo = nodesBack([fr], new Map([[key(fr), at(30, 40)]]))!;
    const moved = { ...fr, X: 30, Y: 40 };
    expect(stepBack(undo, [br, moved], [], rules)).toEqual({
      kind: "nodes",
      before: new Map([[key(fr), at(30, 40)]]),
    });
  });

  it("has nothing to take back when the nodes are already where the undo puts them", () => {
    const undo = nodesBack([fr], new Map([[key(fr), at(30, 40)]]))!;
    expect(stepBack(undo, [fr], [], rules)).toBeNull();
  });

  it("brings back the link an undo takes away", () => {
    expect(stepBack(linkBack(br, fr), [br, fr], [link()], rules)).toEqual(unlinkBack(link()));
    expect(stepBack(linkBack(br, fr), [br, fr], [], rules)).toBeNull();
  });

  it("takes away again the link an undo brings back", () => {
    expect(stepBack(unlinkBack(link()), [br, fr], [], rules)).toEqual(linkBack(br, fr));
    expect(stepBack(unlinkBack(link()), [br, fr], [link()], rules)).toBeNull();
  });
});
