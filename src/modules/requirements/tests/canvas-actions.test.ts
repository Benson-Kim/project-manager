import { beforeEach, describe, expect, it, vi } from "vitest";
import { execProc } from "@/lib/db";
import {
  addCanvasNode,
  allocateRequirement,
  createCanvas,
  deleteCanvas,
  moveCanvasNodes,
  removeCanvasNode,
  updateCanvas,
} from "../repository/canvases";
import {
  addCanvasNodeInput,
  createCanvasInput,
  moveCanvasNodesInput,
  removeCanvasNodeInput,
  updateCanvasInput,
} from "../schemas/canvas";

vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));

const ACTOR = 9;
const proc = vi.mocked(execProc);
const sent = () => proc.mock.calls[0]?.[1];

describe("canvas inputs", () => {
  const node = { kind: "Wbs", itemId: 3, x: 1, y: 2, isCollapsed: false };

  it("trims a name and refuses a blank or long one", () => {
    const base = { projectId: 1, keyDeliverableId: null };
    expect(createCanvasInput.parse({ ...base, name: "  Plan " }).name).toBe("Plan");
    expect(createCanvasInput.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(createCanvasInput.safeParse({ ...base, name: "x".repeat(121) }).success).toBe(false);
  });

  it("files a new canvas nowhere by default, but never clears a filing by omission", () => {
    expect(createCanvasInput.parse({ projectId: 1, name: "A" }).keyDeliverableId).toBeNull();
    const update = { canvasId: 1, name: "A", rowVer: 7 };
    expect(updateCanvasInput.safeParse(update).success).toBe(false);
    expect(updateCanvasInput.safeParse({ ...update, keyDeliverableId: null }).success).toBe(true);
  });

  it("takes a node with no position or a whole one, never half", () => {
    const base = { canvasId: 1, kind: "Requirement", itemId: 2 };
    expect(addCanvasNodeInput.parse(base)).toEqual({ ...base, x: null, y: null });
    expect(addCanvasNodeInput.safeParse({ ...base, x: 5, y: 6 }).success).toBe(true);
    expect(addCanvasNodeInput.safeParse({ ...base, x: 5 }).success).toBe(false);
    expect(addCanvasNodeInput.safeParse({ ...base, x: 2 ** 31, y: 0 }).success).toBe(false);
  });

  it("refuses an unknown kind, so it never reaches the proc parameters", () => {
    const parsed = removeCanvasNodeInput.safeParse({ canvasId: 1, kind: "Project", itemId: 2 });
    expect(parsed.success).toBe(false);
  });

  it("requires every key of a moved node, so an omitted x never clears a position", () => {
    const withoutX = { kind: node.kind, itemId: node.itemId, y: node.y, isCollapsed: false };
    const parse = (row: object) => moveCanvasNodesInput.safeParse({ canvasId: 1, nodes: [row] });
    expect(parse(node).success).toBe(true);
    expect(parse({ ...node, x: null, y: null }).success).toBe(true);
    expect(parse(withoutX).success).toBe(false);
    expect(parse({ ...node, x: 1.5 }).success).toBe(false);
    expect(parse({ ...node, x: null }).success).toBe(false);
  });

  it("refuses more nodes than the proc takes", () => {
    const nodes = Array.from({ length: 2001 }, (_, i) => ({ ...node, itemId: i + 1 }));
    expect(moveCanvasNodesInput.safeParse({ canvasId: 1, nodes }).success).toBe(false);
    expect(moveCanvasNodesInput.safeParse({ canvasId: 1, nodes: [] }).success).toBe(true);
  });

  it("drops a key the caller should not set, so it stays out of the JSON", () => {
    const parsed = moveCanvasNodesInput.parse({
      canvasId: 1,
      projectId: 99,
      nodes: [{ ...node, projectId: 99 }],
    });
    expect(parsed).not.toHaveProperty("projectId");
    expect(parsed.nodes[0]).not.toHaveProperty("projectId");
  });
});

describe("canvas writes", () => {
  beforeEach(() => {
    proc.mockReset();
    proc.mockResolvedValue([{ ProjectId: 5 }]);
  });

  it("maps a requirement and a WBS item to their own proc parameter", async () => {
    await addCanvasNode({ canvasId: 1, kind: "Requirement", itemId: 2, x: 3, y: 4 }, ACTOR);
    expect(sent()).toEqual({
      RequirementCanvasId: 1,
      RequirementId: 2,
      KeyDeliverableId: null,
      X: 3,
      Y: 4,
      ActorUserId: ACTOR,
    });
    proc.mockClear();
    await removeCanvasNode({ canvasId: 1, kind: "Wbs", itemId: 2 }, ACTOR);
    expect(sent()).toEqual({
      RequirementCanvasId: 1,
      RequirementId: null,
      KeyDeliverableId: 2,
      ActorUserId: ACTOR,
    });
  });

  it("sends moved nodes with the keys the proc reads through strict paths", async () => {
    const nodes = [{ kind: "Wbs" as const, itemId: 3, x: null, y: null, isCollapsed: true }];
    await moveCanvasNodes({ canvasId: 1, nodes }, ACTOR);
    expect(JSON.parse(String(sent()?.NodesJson))).toEqual(nodes);
  });

  it("takes the project from the row on the writes that return only that", async () => {
    await expect(
      updateCanvas({ canvasId: 1, name: "A", keyDeliverableId: null, rowVer: 7 }, ACTOR),
    ).resolves.toBe(5);
    await expect(deleteCanvas({ canvasId: 1, rowVer: 7 }, ACTOR)).resolves.toBe(5);
    await expect(
      allocateRequirement({ requirementId: 1, keyDeliverableId: 2 }, ACTOR),
    ).resolves.toBe(5);
  });

  it("fails loudly when a proc returns no project", async () => {
    proc.mockResolvedValue([]);
    await expect(deleteCanvas({ canvasId: 1, rowVer: 7 }, ACTOR)).rejects.toThrow(/no ProjectId/);
  });

  it("returns the new canvas, so the page can open it", async () => {
    const row = {
      RequirementCanvasId: 8,
      Name: "A",
      KeyDeliverableId: null,
      NodeCount: 0,
      RowVer: 7,
    };
    proc.mockResolvedValue([row]);
    await expect(
      createCanvas({ projectId: 1, name: "A", keyDeliverableId: null }, ACTOR),
    ).resolves.toEqual(row);
  });
});
