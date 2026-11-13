import { beforeEach, describe, expect, it, vi } from "vitest";
import { execProc } from "@/lib/db";
import {
  DIAGRAM_LIMITS,
  diagramSchema,
  EMPTY_DIAGRAM,
  readDiagram,
  type BpmnDiagram,
} from "../model/diagram";
import { createDiagram, deleteDiagram, renameDiagram, saveDiagram } from "../repository/diagrams";
import {
  createDiagramInput,
  deleteDiagramInput,
  renameDiagramInput,
  saveDiagramInput,
} from "../schemas/bpmn";

vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));

const ACTOR = 9;
const proc = vi.mocked(execProc);

const shape = (id: string, x = 0, label = "") => ({
  id,
  kind: "task" as const,
  x,
  y: 0,
  width: 120,
  height: 80,
  label,
});

const sample: BpmnDiagram = {
  version: 1,
  pools: [
    {
      id: "pool_a",
      name: "Company",
      x: 0,
      y: 0,
      width: 700,
      lanes: [
        { id: "lane_a", name: "Sales", height: 160 },
        { id: "lane_b", name: "Finance", height: 160 },
      ],
    },
  ],
  shapes: [shape("shape_a", 100), shape("shape_b", 300)],
  flows: [
    {
      id: "flow_a",
      kind: "sequence",
      source: "shape_a",
      target: "shape_b",
      sourceSide: "right",
      targetSide: "left",
      label: "approved",
    },
  ],
};

describe("the diagram document", () => {
  it("accepts a whole diagram and the empty one", () => {
    expect(diagramSchema.parse(sample)).toEqual(sample);
    expect(diagramSchema.safeParse(EMPTY_DIAGRAM).success).toBe(true);
  });

  it("refuses a key the editor never writes, at every level", () => {
    expect(diagramSchema.safeParse({ ...sample, owner: 1 }).success).toBe(false);
    const extraShape = { ...sample, shapes: [{ ...shape("shape_a"), html: "<b>" }] };
    expect(diagramSchema.safeParse(extraShape).success).toBe(false);
    const extraLane = {
      ...sample,
      pools: [{ ...sample.pools[0]!, lanes: [{ id: "l1", name: "A", height: 100, projectId: 2 }] }],
    };
    expect(diagramSchema.safeParse(extraLane).success).toBe(false);
  });

  it("refuses ids that could not be XML ids, such as markup", () => {
    const bad = { ...sample, shapes: [shape('"><script>x</script>'), sample.shapes[1]!] };
    expect(diagramSchema.safeParse(bad).success).toBe(false);
    expect(diagramSchema.safeParse({ ...sample, shapes: [shape("1abc")], flows: [] }).success).toBe(
      false,
    );
  });

  it("refuses a duplicate id and a flow to a shape that is not there", () => {
    const twice = { ...sample, shapes: [shape("shape_a"), shape("shape_a", 50)], flows: [] };
    expect(diagramSchema.safeParse(twice).success).toBe(false);
    const laneClash = { ...sample, shapes: [shape("lane_a"), sample.shapes[1]!], flows: [] };
    expect(diagramSchema.safeParse(laneClash).success).toBe(false);
    const dangling = { ...sample, flows: [{ ...sample.flows[0]!, target: "shape_x" }] };
    expect(diagramSchema.safeParse(dangling).success).toBe(false);
  });

  it("holds labels, names, coordinates and sizes to their limits", () => {
    const long = { ...sample, shapes: [shape("shape_a", 0, "x".repeat(501)), sample.shapes[1]!] };
    expect(diagramSchema.safeParse(long).success).toBe(false);
    const far = { ...sample, shapes: [shape("shape_a", 100_001), sample.shapes[1]!] };
    expect(diagramSchema.safeParse(far).success).toBe(false);
    const thin = { ...sample, shapes: [{ ...shape("shape_a"), width: 5 }, sample.shapes[1]!] };
    expect(diagramSchema.safeParse(thin).success).toBe(false);
    const fractional = { ...sample, shapes: [shape("shape_a", 1.5), sample.shapes[1]!] };
    expect(diagramSchema.safeParse(fractional).success).toBe(false);
    const noLanes = { ...sample, pools: [{ ...sample.pools[0]!, lanes: [] }] };
    expect(diagramSchema.safeParse(noLanes).success).toBe(false);
  });

  it("refuses more shapes than the limit and a document longer than the stored maximum", () => {
    const many = Array.from({ length: DIAGRAM_LIMITS.shapes + 1 }, (_, i) => shape(`s${i}`));
    expect(diagramSchema.safeParse({ ...EMPTY_DIAGRAM, shapes: many }).success).toBe(false);
    const wordy = Array.from({ length: 700 }, (_, i) => shape(`s${i}`, i, "y".repeat(450)));
    const parsed = diagramSchema.safeParse({ ...EMPTY_DIAGRAM, shapes: wordy });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("too large");
  });

  it("opens an unreadable stored document as empty and says so", () => {
    expect(readDiagram(JSON.stringify(sample))).toEqual({ diagram: sample, readable: true });
    expect(readDiagram("not json")).toEqual({ diagram: EMPTY_DIAGRAM, readable: false });
    expect(readDiagram('{"version":2}').readable).toBe(false);
  });
});

describe("diagram inputs", () => {
  it("trims a name and refuses a blank or long one", () => {
    expect(createDiagramInput.parse({ projectId: 1, name: "  Order flow " }).name).toBe(
      "Order flow",
    );
    expect(createDiagramInput.safeParse({ projectId: 1, name: "  " }).success).toBe(false);
    expect(createDiagramInput.safeParse({ projectId: 1, name: "x".repeat(121) }).success).toBe(
      false,
    );
  });

  it("refuses keys the caller should not set", () => {
    expect(createDiagramInput.safeParse({ projectId: 1, name: "A", createdBy: 1 }).success).toBe(
      false,
    );
    expect(
      renameDiagramInput.safeParse({ diagramId: 1, name: "A", rowVer: 1, projectId: 2 }).success,
    ).toBe(false);
    expect(deleteDiagramInput.safeParse({ diagramId: 1, rowVer: 1, isDeleted: 1 }).success).toBe(
      false,
    );
  });

  it("requires the version on every write of an existing diagram", () => {
    expect(renameDiagramInput.safeParse({ diagramId: 1, name: "A" }).success).toBe(false);
    expect(saveDiagramInput.safeParse({ diagramId: 1, diagram: sample }).success).toBe(false);
    expect(deleteDiagramInput.safeParse({ diagramId: 1 }).success).toBe(false);
  });

  it("checks the drawing whole before a save", () => {
    const bad = { ...sample, flows: [{ ...sample.flows[0]!, source: "nope" }] };
    expect(saveDiagramInput.safeParse({ diagramId: 1, diagram: bad, rowVer: 3 }).success).toBe(
      false,
    );
    expect(saveDiagramInput.safeParse({ diagramId: 1, diagram: sample, rowVer: 3 }).success).toBe(
      true,
    );
  });
});

describe("diagram repository", () => {
  beforeEach(() => proc.mockReset());

  it("creates under the actor and reads back the summary", async () => {
    proc.mockResolvedValue([{ BpmnDiagramId: 5, Name: "A", RowVer: 1 }]);
    expect(await createDiagram({ projectId: 2, name: "A" }, ACTOR)).toEqual({
      BpmnDiagramId: 5,
      Name: "A",
      RowVer: 1,
    });
    expect(proc).toHaveBeenCalledWith("usp_BpmnDiagram_Create", {
      ProjectId: 2,
      Name: "A",
      ActorUserId: ACTOR,
    });
  });

  it("saves the drawing as JSON under the version it was read at", async () => {
    proc.mockResolvedValue([{ BpmnDiagramId: 5, ProjectId: 2, RowVer: 8 }]);
    const saved = await saveDiagram({ diagramId: 5, diagram: sample, rowVer: 7 }, ACTOR);
    expect(saved.RowVer).toBe(8);
    const [name, params] = proc.mock.calls[0]!;
    expect(name).toBe("usp_BpmnDiagram_Update");
    expect(params).toMatchObject({ BpmnDiagramId: 5, RowVer: 7, ActorUserId: ACTOR });
    expect(JSON.parse((params as { DiagramJson: string }).DiagramJson)).toEqual(sample);
  });

  it("renames and deletes by id and version only", async () => {
    proc.mockResolvedValue([{ BpmnDiagramId: 5, Name: "B", RowVer: 9, ProjectId: 2 }]);
    await renameDiagram({ diagramId: 5, name: "B", rowVer: 8 }, ACTOR);
    expect(proc).toHaveBeenLastCalledWith("usp_BpmnDiagram_Rename", {
      BpmnDiagramId: 5,
      Name: "B",
      RowVer: 8,
      ActorUserId: ACTOR,
    });
    proc.mockResolvedValue([{ ProjectId: 2 }]);
    await deleteDiagram({ diagramId: 5, rowVer: 9 }, ACTOR);
    expect(proc).toHaveBeenLastCalledWith("usp_BpmnDiagram_Delete", {
      BpmnDiagramId: 5,
      RowVer: 9,
      ActorUserId: ACTOR,
    });
  });
});
