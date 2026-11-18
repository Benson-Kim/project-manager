import { describe, expect, it } from "vitest";
import { anchorOn, labelPoint, pointAt, type Rect } from "@/lib/connector-route";
import { PLAIN_STYLE, type ConnectorStyle } from "@/lib/connector-style";
import type { CanvasLink } from "../schemas/canvas";
import {
  carriesLook,
  layoutLinks,
  lookOf,
  plainPoints,
  withLook,
  type LaidEdge,
} from "../canvas/link-layout";

const rect = (x: number, y: number): Rect => ({ x, y, width: 100, height: 40 });
const style = (over: Partial<ConnectorStyle>): ConnectorStyle => ({ ...PLAIN_STYLE, ...over });
const edge = (over: Partial<LaidEdge> & Pick<LaidEdge, "id">): LaidEdge => ({
  source: "a",
  target: "b",
  style: null,
  branch: null,
  ...over,
});

const rects = new Map([
  ["a", rect(0, 0)],
  ["b", rect(300, 200)],
  ["c", rect(300, 400)],
]);
const fixed = style({
  shape: "straight",
  attach: "fixed",
  sourceSide: "bottom",
  targetSide: "top",
});

describe("link layout", () => {
  it("leaves out a line nobody styled, so it keeps its usual path", () => {
    const laid = layoutLinks(
      [edge({ id: "plain" }), edge({ id: "reset", style: PLAIN_STYLE })],
      rects,
    );
    expect(laid.size).toBe(0);
  });

  it("starts and ends a fixed line on the chosen sides, and follows a moved card", () => {
    const line = layoutLinks([edge({ id: "e", style: fixed })], rects).get("e");
    expect(line?.points[0]).toEqual(anchorOn(rects.get("a")!, "bottom"));
    expect(line?.points.at(-1)).toEqual(anchorOn(rects.get("b")!, "top"));

    const moved = new Map(rects).set("b", rect(500, 50));
    const after = layoutLinks([edge({ id: "e", style: fixed })], moved).get("e");
    expect(after?.points.at(-1)).toEqual(anchorOn(moved.get("b")!, "top"));
    expect(after?.path).not.toBe(line?.path);
  });

  it("lets a floating line take the sides that face each other", () => {
    const floating = style({ attach: "floating", sourceSide: "top", targetSide: "top" });
    const below = new Map(rects).set("b", rect(0, 300));
    const down = layoutLinks([edge({ id: "e", style: floating })], below).get("e");
    expect(down?.points[0]).toEqual(anchorOn(below.get("a")!, "bottom"));
    expect(down?.points.at(-1)).toEqual(anchorOn(below.get("b")!, "top"));

    const beside = new Map(rects).set("b", rect(400, 0));
    const across = layoutLinks([edge({ id: "e", style: floating })], beside).get("e");
    expect(across?.points[0]).toEqual(anchorOn(beside.get("a")!, "right"));
    expect(across?.points.at(-1)).toEqual(anchorOn(beside.get("b")!, "left"));
  });

  it("starts a branch on its parent's label, or at a share of the parent's length", () => {
    const parent = plainPoints({ id: "p", source: "a", target: "b" }, rects)!;
    const fromLabel = layoutLinks(
      [edge({ id: "p" }), edge({ id: "k", target: "c", branch: { fromEdge: "p", at: null } })],
      rects,
    );
    expect(fromLabel.has("p")).toBe(false);
    expect(fromLabel.get("k")?.points[0]).toEqual(labelPoint(parent));

    const fromPoint = layoutLinks(
      [edge({ id: "p" }), edge({ id: "k", target: "c", branch: { fromEdge: "p", at: 25 } })],
      rects,
    );
    expect(fromPoint.get("k")?.points[0]).toEqual(pointAt(parent, 0.25));
  });

  it("starts a branch on its own card when the parent line is not drawn", () => {
    const laid = layoutLinks(
      [edge({ id: "k", target: "c", branch: { fromEdge: "gone", at: 50 } })],
      rects,
    );
    expect(laid.get("k")?.points[0]).toEqual(anchorOn(rects.get("a")!, "right"));
  });

  it("hops over a line drawn before it only when jumps are on", () => {
    const board = new Map([
      ["l", rect(0, 100)],
      ["r", rect(400, 100)],
      ["t", rect(200, 0)],
      ["d", rect(200, 300)],
    ]);
    const across = edge({ id: "across", source: "l", target: "r" });
    const down = (jumps: boolean) =>
      edge({ id: "down", source: "t", target: "d", style: { ...fixed, jumps } });
    const flat = layoutLinks([across, down(false)], board).get("down")?.path;
    const hopped = layoutLinks([across, down(true)], board).get("down")?.path;
    expect(hopped).not.toBe(flat);
    expect(layoutLinks([down(true)], board).get("down")?.path).toBe(flat);
  });

  it("gives a plain line today's angled right-to-left points", () => {
    const points = plainPoints({ id: "p", source: "a", target: "b" }, rects);
    expect(points?.[0]).toEqual(anchorOn(rects.get("a")!, "right"));
    expect(points?.at(-1)).toEqual(anchorOn(rects.get("b")!, "left"));
    expect(plainPoints({ id: "p", source: "a", target: "missing" }, rects)).toBeUndefined();
  });
});

describe("a saved link carrying a shown look", () => {
  const link: CanvasLink = {
    UpstreamKind: "Requirement",
    UpstreamId: 1,
    DownstreamId: 2,
    LinkStatus: "Active",
    RowVer: 1,
  };
  const look = {
    style: style({ shape: "curved", pattern: "dashed", colour: "#2563EB", weight: 4 }),
    branchFromId: 7,
    branchAt: 50,
  };

  it("lets the shown look go once a read of the link carries it", () => {
    expect(carriesLook(withLook(link, look), look)).toBe(true);
  });

  it("treats a colour saved in other letter case as the same look", () => {
    const saved = withLook(link, { ...look, style: { ...look.style, colour: "#2563eb" } });
    expect(carriesLook(saved, look)).toBe(true);
  });

  it("keeps the shown look while the read still has an older field", () => {
    const older = withLook(link, { ...look, style: { ...look.style, weight: 2 } });
    expect(carriesLook(older, look)).toBe(false);
    expect(carriesLook(withLook(link, { ...look, branchAt: null }), look)).toBe(false);
    expect(carriesLook(link, look)).toBe(false);
  });

  it("matches a plain link with the plain look", () => {
    expect(carriesLook(link, lookOf(link))).toBe(true);
  });
});
