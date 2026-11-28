import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH } from "../canvas/layout";
import {
  capMoves,
  hasOverlaps,
  separateOverlaps,
  separationMoves,
  type OverlapNode,
} from "../canvas/separate-overlaps";

const node = (id: string, x: number, y: number, over: Partial<OverlapNode> = {}): OverlapNode => ({
  id,
  position: { x, y },
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
  ...over,
});

describe("canvas separateOverlaps", () => {
  it("handles empty and single-node canvases cleanly", () => {
    expect(hasOverlaps([])).toBe(false);
    expect(separateOverlaps([])).toEqual([]);

    const one = [node("Requirement:1", 40, 80)];
    expect(hasOverlaps(one)).toBe(false);
    expect(separateOverlaps(one)).toEqual(one);
    expect(separationMoves(one, separateOverlaps(one))).toEqual([]);
  });

  it("treats edge-touching cards as non-overlapping and leaves them untouched", () => {
    const touching = [
      node("Requirement:1", 0, 0),
      node("Requirement:2", NODE_WIDTH, 0),
      node("Requirement:3", 0, NODE_HEIGHT),
    ];
    expect(hasOverlaps(touching)).toBe(false);
    const after = separateOverlaps(touching);
    expect(after).toEqual(touching);
    expect(separationMoves(touching, after)).toEqual([]);
  });

  it("nudges overlapping cards apart while preserving non-overlapping manual placements", () => {
    const manual1 = node("Requirement:3", 600, 0);
    const manual2 = node("Requirement:4", 0, 450);
    const nearClean = node("Requirement:5", 0, 175);
    const input = [
      node("Requirement:1", 0, 0),
      node("Requirement:2", 20, 20),
      manual1,
      manual2,
      nearClean,
    ];
    expect(hasOverlaps(input)).toBe(true);

    const after = separateOverlaps(input);
    expect(hasOverlaps(after)).toBe(false);
    expect(after[2]?.position).toEqual(manual1.position);
    expect(after[3]?.position).toEqual(manual2.position);
    expect(after[4]?.position).toEqual(nearClean.position);

    const moves = separationMoves(input, after);
    expect(moves.map((m) => m.id).sort()).toEqual(["Requirement:1", "Requirement:2"]);
  });

  it("breaks ties deterministically for identical coordinates regardless of input order", () => {
    const stack = Array.from({ length: 12 }, (_, i) => node(`Requirement:${i + 1}`, 100, 200));
    const forward = separateOverlaps(stack);
    const reversed = separateOverlaps([...stack].reverse());

    expect(hasOverlaps(forward)).toBe(false);
    expect(hasOverlaps(reversed)).toBe(false);

    const mapForward = new Map(forward.map((n) => [n.id, n.position]));
    const mapReversed = new Map(reversed.map((n) => [n.id, n.position]));
    expect(mapForward).toEqual(mapReversed);
  });

  it("guarantees zero overlaps even when maxIterations forces fallback placement", () => {
    const cluster = Array.from({ length: 25 }, (_, i) =>
      node(`Requirement:${i + 1}`, (i % 3) * 10, Math.floor(i / 3) * 5),
    );
    const after = separateOverlaps(cluster, { maxIterations: 1, gap: 16 });
    expect(hasOverlaps(after)).toBe(false);
    for (const item of after) {
      expect(Number.isInteger(item.position.x)).toBe(true);
      expect(Number.isInteger(item.position.y)).toBe(true);
    }
  });

  it("sanitizes NaN, Infinity, -0, fractional, out-of-range int32 coords, and invalid sizes", () => {
    const dirty: OverlapNode[] = [
      node("Requirement:1", Number.NaN, Number.POSITIVE_INFINITY, {
        width: 0,
        height: -10,
        measured: { width: Number.NaN, height: 0 },
      }),
      node("Requirement:2", -0.2, 0.4),
      node("Requirement:3", 2 ** 31 + 500, -(2 ** 31) - 500),
      node("Requirement:4", 2 ** 31 + 100, -(2 ** 31) - 100),
    ];
    const after = separateOverlaps(dirty);
    expect(hasOverlaps(after)).toBe(false);
    for (const entry of after) {
      expect(Number.isSafeInteger(entry.position.x)).toBe(true);
      expect(Number.isSafeInteger(entry.position.y)).toBe(true);
      expect(Object.is(entry.position.x, -0)).toBe(false);
      expect(Object.is(entry.position.y, -0)).toBe(false);
      expect(entry.position.x).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(entry.position.x).toBeLessThanOrEqual(2 ** 31 - 1);
      expect(entry.position.y).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(entry.position.y).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });

  describe("hidden cards are obstacles", () => {
    const overlap = (a: OverlapNode, b: OverlapNode) =>
      a.position.x < b.position.x + NODE_WIDTH &&
      b.position.x < a.position.x + NODE_WIDTH &&
      a.position.y < b.position.y + NODE_HEIGHT &&
      b.position.y < a.position.y + NODE_HEIGHT;

    const expectClearOfHidden = (input: readonly OverlapNode[], after: readonly OverlapNode[]) => {
      input.forEach((entry, i) => {
        if (entry.hidden) expect(after[i]).toBe(entry);
      });
      const moved = after.filter((entry, i) => entry !== input[i]);
      for (const card of moved) {
        for (const hidden of after.filter((entry) => entry.hidden)) {
          expect(overlap(card, hidden)).toBe(false);
        }
      }
      expect(separationMoves(input, after).some((move) => move.id.startsWith("Hidden"))).toBe(
        false,
      );
    };

    it("does not count a visible card resting on a hidden one as an overlap", () => {
      const input = [node("Requirement:1", 0, 0), node("Hidden:1", 0, 0, { hidden: true })];
      expect(hasOverlaps(input)).toBe(false);
      const after = separateOverlaps(input);
      expect(after).toEqual(input);
      expect(separationMoves(input, after)).toEqual([]);
    });

    it("never moves hidden cards, even ones that overlap each other or sit off the grid", () => {
      const input = [
        node("Requirement:1", 0, 0),
        node("Requirement:2", 10, 10),
        node("Hidden:1", 40.5, 20.25, { hidden: true }),
        node("Hidden:2", 40.5, 20.25, { hidden: true }),
      ];
      const after = separateOverlaps(input);
      expect(hasOverlaps(after)).toBe(false);
      expectClearOfHidden(input, after);
    });

    it("never lands a moved card on a hidden card that blocks the nearest free spot", () => {
      const ring: OverlapNode[] = [];
      for (let gy = -2; gy <= 2; gy += 1) {
        for (let gx = -2; gx <= 2; gx += 1) {
          if (gx === 0 && gy === 0) continue;
          ring.push(
            node(`Hidden:${ring.length + 1}`, gx * (NODE_WIDTH + 24), gy * (NODE_HEIGHT + 24), {
              hidden: true,
            }),
          );
        }
      }
      const stack = Array.from({ length: 12 }, (_, i) => node(`Requirement:${i + 1}`, 0, 0));
      const input = [...stack, ...ring];
      expect(hasOverlaps(input)).toBe(true);
      const after = separateOverlaps(input);
      expect(hasOverlaps(after)).toBe(false);
      expectClearOfHidden(input, after);
      expect(separateOverlaps([...input].reverse())).toEqual([...after].reverse());
    });

    it.each([
      ["wider than the free-slot search reaches", 100_000],
      ["running past the last storable position", 3_000_000_000],
    ])("clears every card off a hidden card %s", (_label, width) => {
      const hidden = node("Hidden:1", -50_000, -50_000, {
        hidden: true,
        width,
        height: 100_000,
      });
      const cards = [
        node("Requirement:1", 0, 0),
        node("Requirement:2", 20, 20),
        node("Requirement:3", 40, 40),
        node("Requirement:4", 0, 600),
        node("Requirement:5", 10, 610),
      ];
      const input = [...cards, hidden];
      const after = separateOverlaps(input);

      const intersects = (a: OverlapNode, b: OverlapNode) =>
        a.position.x < b.position.x + b.width! &&
        b.position.x < a.position.x + a.width! &&
        a.position.y < b.position.y + b.height! &&
        b.position.y < a.position.y + a.height!;
      after.forEach((a, i) => {
        for (const b of after.slice(i + 1)) expect(intersects(a, b)).toBe(false);
        expect(a.position.x).toBeGreaterThanOrEqual(-(2 ** 31));
        expect(a.position.x).toBeLessThanOrEqual(2 ** 31 - 1);
      });
      expect(after.at(-1)).toBe(hidden);
      expect(separateOverlaps([...input].reverse())).toEqual([...after].reverse());
    });
  });

  it("handles duplicate ids safely and separates 100 stacked nodes quickly", () => {
    const dupes = [node("Requirement:1", 0, 0), node("Requirement:1", 0, 0)];
    expect(hasOverlaps(dupes)).toBe(true);
    expect(hasOverlaps(separateOverlaps(dupes))).toBe(false);

    const hundred = Array.from({ length: 100 }, (_, i) => node(`Requirement:${i + 1}`, 0, 0));
    const separated = separateOverlaps(hundred);
    expect(hasOverlaps(separated)).toBe(false);
  });
});

describe("canvas capMoves", () => {
  const cap = 3;
  const moves = (count: number) => Array.from({ length: count }, (_, i) => i);

  it.each([
    ["under", cap - 1, cap - 1, false],
    ["exactly at", cap, cap, false],
    ["one over", cap + 1, cap, true],
  ])("keeps the first moves up to the cap: %s", (_label, count, kept, capped) => {
    expect(capMoves(moves(count), cap)).toEqual({ batch: moves(kept), capped });
  });
});
