import { describe, expect, it } from "vitest";
import { UNDO_LIMIT } from "@/lib/undo-stack";
import { EMPTY_DIAGRAM, poolHeight, type BpmnDiagram } from "../model/diagram";
import {
  addLane,
  addPool,
  addShape,
  connect,
  diagramBounds,
  duplicateShape,
  laneAt,
  movePool,
  moveShapes,
  reconnect,
  removeElements,
  removeLane,
  renameLane,
  resizeLane,
  resizePoolWidth,
  setFlowKind,
  setFlowLabel,
  setShapeLabel,
  setStepDetail,
  COPY_OFFSET,
} from "../model/edit";
import { EMPTY_HISTORY, record, redo, undo } from "../model/history";
import { flowKindFor, glyph, isResizable, SHAPE_SPECS } from "../model/shapes";

const names = { pool: "Pool", lane: (n: number) => `Lane ${n}` };

/** A pool at the origin with lanes 0-160 and 160-320, a task in each lane and one outside. */
function twoLanes(): BpmnDiagram {
  let d = addPool(EMPTY_DIAGRAM, { x: 0, y: 0 }, { pool: "p1", lanes: ["l1", "l2"] }, names);
  d = addShape(d, "task", { x: 200, y: 80 }, "top");
  d = addShape(d, "task", { x: 200, y: 240 }, "bottom");
  d = addShape(d, "endEvent", { x: 1000, y: 80 }, "outside");
  return d;
}

const at = (d: BpmnDiagram, id: string) => {
  const shape = d.shapes.find((each) => each.id === id)!;
  return { x: shape.x, y: shape.y };
};

describe("shapes", () => {
  it("places a symbol centred on the point at its catalogue size", () => {
    const d = addShape(EMPTY_DIAGRAM, "exclusiveGateway", { x: 100, y: 100 }, "g1");
    expect(d.shapes[0]).toEqual({
      id: "g1",
      kind: "exclusiveGateway",
      x: 75,
      y: 75,
      width: 50,
      height: 50,
      label: "",
    });
  });

  it("moves to whole positions and keeps the rest", () => {
    const d = moveShapes(twoLanes(), new Map([["top", { x: 10.4, y: 20.6 }]]));
    expect(at(d, "top")).toEqual({ x: 10, y: 21 });
    expect(at(d, "bottom")).toEqual(at(twoLanes(), "bottom"));
  });

  it("duplicates a shape with its text and details, offset, under a new id", () => {
    const base = setStepDetail(
      setShapeLabel(twoLanes(), "top", "Check order"),
      "top",
      "role",
      "Clerk",
    );
    const d = duplicateShape(base, "top", "copy");
    const copy = d.shapes.find((s) => s.id === "copy")!;
    expect(d.shapes).toHaveLength(base.shapes.length + 1);
    expect(copy).toMatchObject({ kind: "task", label: "Check order", step: { role: "Clerk" } });
    expect(at(d, "copy")).toEqual({
      x: at(base, "top").x + COPY_OFFSET,
      y: at(base, "top").y + COPY_OFFSET,
    });
    expect(duplicateShape(base, "missing", "copy")).toBe(base);
  });

  it("cuts a label at the limit", () => {
    const d = setShapeLabel(twoLanes(), "top", "z".repeat(600));
    expect(d.shapes.find((s) => s.id === "top")!.label).toHaveLength(500);
  });

  it("draws every catalogue symbol, and only activities and notes resize", () => {
    for (const spec of Object.values(SHAPE_SPECS)) {
      expect(glyph(spec.kind, spec.width, spec.height).length).toBeGreaterThan(0);
    }
    expect(isResizable("task")).toBe(true);
    expect(isResizable("textAnnotation")).toBe(true);
    expect(isResizable("startEvent")).toBe(false);
    expect(isResizable("parallelGateway")).toBe(false);
  });
});

describe("connectors", () => {
  const base = () =>
    connect(twoLanes(), {
      id: "f1",
      kind: "sequence",
      source: "top",
      target: "bottom",
      sourceSide: "bottom",
      targetSide: "top",
    });

  it("joins two shapes once per direction and type, never a shape to itself", () => {
    const d = base();
    expect(d.flows).toHaveLength(1);
    expect(d.flows[0]!.label).toBe("");
    const again = connect(d, { ...d.flows[0]!, id: "f2" });
    expect(again).toBe(d);
    const self = connect(d, { ...d.flows[0]!, id: "f3", target: "top" });
    expect(self).toBe(d);
    const missing = connect(d, { ...d.flows[0]!, id: "f4", target: "gone" });
    expect(missing).toBe(d);
    const message = connect(d, { ...d.flows[0]!, id: "f5", kind: "message" });
    expect(message.flows).toHaveLength(2);
  });

  it("never changes a connector into a twin of another", () => {
    const d = connect(base(), { ...base().flows[0]!, id: "f2", kind: "message" });
    expect(setFlowKind(d, "f2", "sequence")).toEqual(d);
    expect(setFlowKind(d, "f2", "default").flows[1]!.kind).toBe("default");
    const other = connect(d, { ...d.flows[0]!, id: "f3", target: "outside" });
    const ends = {
      source: "top",
      target: "bottom",
      sourceSide: "right",
      targetSide: "left",
    } as const;
    expect(reconnect(other, "f3", ends)).toBe(other);
    expect(reconnect(other, "f3", { ...ends, target: "top" })).toBe(other);
    expect(
      reconnect(other, "f3", { ...ends, source: "bottom", target: "top" }).flows[2],
    ).toMatchObject({
      source: "bottom",
      target: "top",
    });
  });

  it("takes text on a connector", () => {
    expect(setFlowLabel(base(), "f1", "Yes").flows[0]!.label).toBe("Yes");
  });

  it("joins data and notes by association whatever type is picked", () => {
    expect(flowKindFor("task", "dataObject", "sequence")).toBe("association");
    expect(flowKindFor("textAnnotation", "task", "message")).toBe("association");
    expect(flowKindFor("task", "endEvent", "message")).toBe("message");
  });

  it("removes a shape's connectors with it", () => {
    const d = removeElements(base(), new Set(["top"]));
    expect(d.shapes.map((s) => s.id)).toEqual(["bottom", "outside"]);
    expect(d.flows).toEqual([]);
  });
});

describe("pools and lanes", () => {
  it("adds a pool with two named lanes and as many more as wanted", () => {
    let d = twoLanes();
    expect(d.pools[0]!.lanes.map((l) => l.name)).toEqual(["Lane 1", "Lane 2"]);
    d = addLane(d, "p1", "l3", "  Approvals  ");
    expect(d.pools[0]!.lanes.map((l) => l.name)).toEqual(["Lane 1", "Lane 2", "Approvals"]);
    expect(poolHeight(d.pools[0]!)).toBe(480);
    d = addPool(d, { x: 0, y: 600 }, { pool: "p2", lanes: ["l4", "l5"] }, names);
    expect(d.pools).toHaveLength(2);
  });

  it("finds the lane a point falls in", () => {
    const d = twoLanes();
    expect(laneAt(d, { x: 200, y: 80 })).toEqual({ poolId: "p1", laneId: "l1" });
    expect(laneAt(d, { x: 200, y: 240 })).toEqual({ poolId: "p1", laneId: "l2" });
    expect(laneAt(d, { x: 1000, y: 80 })).toBeNull();
  });

  it("renames a lane, trimmed", () => {
    expect(renameLane(twoLanes(), "p1", "l2", "  Finance ").pools[0]!.lanes[1]!.name).toBe(
      "Finance",
    );
  });

  it("keeps the last lane and the shapes of a removed one", () => {
    let d = removeLane(twoLanes(), "p1", "l2");
    expect(d.pools[0]!.lanes.map((l) => l.id)).toEqual(["l1"]);
    expect(d.shapes).toHaveLength(3);
    d = removeLane(d, "p1", "l1");
    expect(d.pools[0]!.lanes).toHaveLength(1);
  });

  it("grows a lane and moves the lanes below with their shapes", () => {
    const before = twoLanes();
    const d = resizeLane(before, "p1", "l1", 260);
    expect(d.pools[0]!.lanes[0]!.height).toBe(260);
    expect(at(d, "top")).toEqual(at(before, "top"));
    expect(at(d, "bottom").y).toBe(at(before, "bottom").y + 100);
    expect(at(d, "outside")).toEqual(at(before, "outside"));
    expect(laneAt(d, { x: 200, y: at(d, "bottom").y + 40 })?.laneId).toBe("l2");
  });

  it("never shrinks a lane below its minimum", () => {
    expect(resizeLane(twoLanes(), "p1", "l1", 5).pools[0]!.lanes[0]!.height).toBe(60);
  });

  it("moves a pool with what is inside it, but not shapes moving themselves", () => {
    const before = twoLanes();
    const d = movePool(before, "p1", { x: 50, y: 30 }, new Set(["bottom"]));
    expect(d.pools[0]).toMatchObject({ x: 50, y: 30 });
    expect(at(d, "top")).toEqual({ x: at(before, "top").x + 50, y: at(before, "top").y + 30 });
    expect(at(d, "bottom")).toEqual(at(before, "bottom"));
    expect(at(d, "outside")).toEqual(at(before, "outside"));
  });

  it("keeps a pool wide enough for its headings", () => {
    expect(resizePoolWidth(twoLanes(), "p1", 10).pools[0]!.width).toBeGreaterThanOrEqual(120);
  });

  it("leaves a deleted pool's shapes on the canvas", () => {
    const d = removeElements(twoLanes(), new Set(["p1"]));
    expect(d.pools).toEqual([]);
    expect(d.shapes).toHaveLength(3);
  });

  it("measures everything drawn", () => {
    expect(diagramBounds(EMPTY_DIAGRAM)).toBeNull();
    expect(diagramBounds(twoLanes())).toEqual({ x: 0, y: 0, width: 1020, height: 320 });
  });
});

describe("undo and redo", () => {
  it("steps back and forward through whole diagrams, and a new change drops redo", () => {
    const a = EMPTY_DIAGRAM;
    const b = addShape(a, "task", { x: 0, y: 0 }, "t1");
    let history = record(EMPTY_HISTORY, a);
    const back = undo(history, b)!;
    expect(back.diagram).toBe(a);
    const forward = redo(back.history, a)!;
    expect(forward.diagram).toBe(b);
    history = record(back.history, a);
    expect(redo(history, a)).toBeNull();
  });

  it("keeps the shared number of steps", () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < UNDO_LIMIT + 5; i++) history = record(history, EMPTY_DIAGRAM);
    expect(history.past).toHaveLength(UNDO_LIMIT);
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(20);
  });

  it("has nothing to undo or redo at the start", () => {
    expect(undo(EMPTY_HISTORY, EMPTY_DIAGRAM)).toBeNull();
    expect(redo(EMPTY_HISTORY, EMPTY_DIAGRAM)).toBeNull();
  });
});
