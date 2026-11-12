import { poolHeight, type BpmnDiagram, type Side, SIDES } from "../model/diagram";
import type { FlowFlowEdge } from "./flow-edge";
import type { PoolFlowNode } from "./pool-node";
import type { ShapeFlowNode } from "./shape-node";

export type BoardNode = ShapeFlowNode | PoolFlowNode;

/**
 * Pools sit under connectors, connectors under symbols. Every node states its measured size, which
 * the model knows exactly; without it React Flow forgets its handle positions on each render.
 */
const Z = { pool: 0, flow: 1, shape: 2 } as const;

/** The class that marks what drags a pool: its heading strips, never its lanes. */
export const POOL_DRAG_HANDLE = "bpmn-pool-drag";

export function toNodes(diagram: BpmnDiagram, selected: ReadonlySet<string>): BoardNode[] {
  return [
    ...diagram.pools.map((pool): PoolFlowNode => ({
      id: pool.id,
      type: "pool",
      position: { x: pool.x, y: pool.y },
      width: pool.width,
      height: poolHeight(pool),
      measured: { width: pool.width, height: poolHeight(pool) },
      data: { pool },
      zIndex: Z.pool,
      selected: selected.has(pool.id),
      dragHandle: `.${POOL_DRAG_HANDLE}`,
      style: { pointerEvents: "none" },
    })),
    ...diagram.shapes.map((shape): ShapeFlowNode => ({
      id: shape.id,
      type: "shape",
      position: { x: shape.x, y: shape.y },
      width: shape.width,
      height: shape.height,
      measured: { width: shape.width, height: shape.height },
      data: { shape },
      zIndex: Z.shape,
      selected: selected.has(shape.id),
    })),
  ];
}

export function toEdges(
  diagram: BpmnDiagram,
  selected: ReadonlySet<string>,
  canEdit: boolean,
): FlowFlowEdge[] {
  return diagram.flows.map((flow) => ({
    id: flow.id,
    type: "flow",
    source: flow.source,
    target: flow.target,
    sourceHandle: flow.sourceSide,
    targetHandle: flow.targetSide,
    data: { flow },
    zIndex: Z.flow,
    selected: selected.has(flow.id),
    reconnectable: canEdit,
  }));
}

export const asSide = (handle: string | null | undefined, fallback: Side): Side =>
  (SIDES as readonly string[]).includes(handle ?? "") ? (handle as Side) : fallback;

/** A fresh element id; it also has to be a valid XML id for the BPMN export. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random.slice(0, 12)}`;
}
