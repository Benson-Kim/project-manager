import { describe, expect, it } from "vitest";
import { layoutCanvas } from "../canvas/layout";

const req = (id: number) => ({ Kind: "Requirement" as const, ItemId: id, Ref: String(id) });
const link = (up: number, down: number) => ({
  UpstreamKind: "Requirement" as const,
  UpstreamId: up,
  DownstreamId: down,
});

describe("layoutCanvas", () => {
  it("ranks by the longest path, so a skipped level sits in the right column", () => {
    const points = layoutCanvas([req(1), req(2), req(3)], [link(1, 2), link(2, 3), link(1, 3)]);
    const [a, b, c] = [1, 2, 3].map((id) => points.get(`Requirement:${id}`)?.x ?? -1);
    expect(a).toBeLessThan(b ?? -1);
    expect(b).toBeLessThan(c ?? -1);
  });

  it("puts a WBS item upstream of the requirement it links to", () => {
    const wbs = { Kind: "Wbs" as const, ItemId: 9, Ref: "1.2" };
    const points = layoutCanvas(
      [req(1), wbs],
      [{ UpstreamKind: "Wbs", UpstreamId: 9, DownstreamId: 1 }],
    );
    expect(points.get("Wbs:9")?.x).toBeLessThan(points.get("Requirement:1")?.x ?? -1);
  });

  it("orders a column by its neighbours, so links do not cross", () => {
    const points = layoutCanvas([req(1), req(2), req(3), req(4)], [link(1, 4), link(2, 3)]);
    const y = (id: number) => points.get(`Requirement:${id}`)?.y ?? 0;
    expect(y(4) - y(3)).toBe(y(1) - y(2));
  });

  it("ignores a link with an end off the canvas", () => {
    const points = layoutCanvas([req(1), req(2)], [link(1, 7), link(7, 2)]);
    expect(points.get("Requirement:1")?.x).toBe(points.get("Requirement:2")?.x);
  });

  it("gives every item a whole-number place and still ends if data ever held a loop", () => {
    const points = layoutCanvas([req(1), req(2), req(3)], [link(1, 2), link(2, 1)]);
    expect(points.size).toBe(3);
    for (const { x, y } of points.values()) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    }
  });
});
