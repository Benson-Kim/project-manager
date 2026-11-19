import { describe, expect, it } from "vitest";
import type { BpmnDiagram, BpmnFlow, BpmnShape, Side } from "../model/diagram";
import { EMPTY_HISTORY, record, undo } from "../model/history";
import { straightenFlows, straightenScope } from "../model/straighten";

const box = (x: number, y: number, width = 100, height = 80) => ({ x, y, width, height });

const shape = (id: string, x: number, y: number, width = 100, height = 80): BpmnShape => ({
  id,
  kind: "task",
  label: id,
  ...box(x, y, width, height),
});

const flow = (id: string, source: string, target: string, sides: [Side, Side]): BpmnFlow => ({
  id,
  kind: "sequence",
  source,
  target,
  sourceSide: sides[0],
  targetSide: sides[1],
  label: "",
});

describe("straightenFlows", () => {
  const diagram: BpmnDiagram = {
    version: 1,
    pools: [],
    shapes: [shape("A", 0, 0), shape("B", 300, 0), shape("C", 300, 300)],
    flows: [flow("f1", "A", "B", ["bottom", "bottom"]), flow("f2", "B", "C", ["left", "right"])],
  };

  it("straightens every flow when nothing is selected", () => {
    const next = straightenFlows(diagram, straightenScope(new Set()));
    expect(next.flows.map((f) => [f.sourceSide, f.targetSide])).toEqual([
      ["right", "left"],
      ["bottom", "top"],
    ]);
  });

  it("straightens only the flows in the selection", () => {
    const next = straightenFlows(diagram, straightenScope(new Set(["A", "B"])));
    expect(next.flows[0]).toMatchObject({ sourceSide: "right", targetSide: "left" });
    expect(next.flows[1]).toEqual(diagram.flows[1]);
    const picked = straightenFlows(diagram, straightenScope(new Set(["f2"])));
    expect(picked.flows[0]).toEqual(diagram.flows[0]);
    expect(picked.flows[1]).toMatchObject({ sourceSide: "bottom", targetSide: "top" });
  });

  it("returns the same diagram when the lines are already straight", () => {
    const once = straightenFlows(diagram, null);
    expect(straightenFlows(once, null)).toBe(once);
  });

  it("is one step that Undo takes back", () => {
    const next = straightenFlows(diagram, null);
    const back = undo(record(EMPTY_HISTORY, diagram), next);
    expect(back?.diagram).toBe(diagram);
  });
});
