import { describe, expect, it } from "vitest";
import { asSide, newId, POOL_DRAG_HANDLE, toEdges, toNodes } from "../components/board-model";
import { EMPTY_DIAGRAM, shapeSchema } from "../model/diagram";
import { addPool, addShape, connect } from "../model/edit";

function sample() {
  let d = addPool(
    EMPTY_DIAGRAM,
    { x: 0, y: 0 },
    { pool: "p1", lanes: ["l1", "l2"] },
    { pool: "Pool", lane: (n) => `Lane ${n}` },
  );
  d = addShape(d, "task", { x: 100, y: 80 }, "a");
  d = addShape(d, "task", { x: 400, y: 240 }, "b");
  return connect(d, {
    id: "f1",
    kind: "message",
    source: "a",
    target: "b",
    sourceSide: "bottom",
    targetSide: "top",
  });
}

describe("board mapping", () => {
  it("puts pools under connectors and connectors under symbols", () => {
    const d = sample();
    const nodes = toNodes(d, new Set());
    const [edge] = toEdges(d, new Set(), true);
    const pool = nodes.find((n) => n.id === "p1")!;
    const shape = nodes.find((n) => n.id === "a")!;
    expect(nodes[0]!.id).toBe("p1");
    expect(pool.zIndex!).toBeLessThan(edge!.zIndex!);
    expect(edge!.zIndex!).toBeLessThan(shape.zIndex!);
  });

  it("states every node's size, and drags pools only by their headings", () => {
    const nodes = toNodes(sample(), new Set(["a"]));
    const pool = nodes.find((n) => n.id === "p1")!;
    expect(pool.measured).toEqual({ width: 720, height: 320 });
    expect(pool.dragHandle).toBe(`.${POOL_DRAG_HANDLE}`);
    expect(pool.style).toEqual({ pointerEvents: "none" });
    const shape = nodes.find((n) => n.id === "a")!;
    expect(shape.measured).toEqual({ width: 120, height: 80 });
    expect(shape.selected).toBe(true);
  });

  it("joins connectors at the sides they were drawn from, editable only for editors", () => {
    const [edge] = toEdges(sample(), new Set(["f1"]), false);
    expect(edge).toMatchObject({
      source: "a",
      target: "b",
      sourceHandle: "bottom",
      targetHandle: "top",
      selected: true,
      reconnectable: false,
    });
  });

  it("reads a handle id as a side, falling back for anything else", () => {
    expect(asSide("left", "right")).toBe("left");
    expect(asSide(null, "right")).toBe("right");
    expect(asSide("middle", "top")).toBe("top");
  });

  it("makes ids the document schema accepts", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId("shape")));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      const shape = { id, kind: "task", x: 0, y: 0, width: 120, height: 80, label: "" };
      expect(shapeSchema.safeParse(shape).success).toBe(true);
    }
  });
});
