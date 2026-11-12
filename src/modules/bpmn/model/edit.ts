import {
  DIAGRAM_LIMITS,
  poolHeight,
  type BpmnDiagram,
  type BpmnFlow,
  type BpmnPool,
  type BpmnShape,
  type FlowKind,
  type ShapeKind,
  type Side,
} from "./diagram";
import { SHAPE_SPECS } from "./shapes";

/**
 * Every change to a diagram is one of these pure functions (ADR-0064): the canvas, Undo and the
 * tests all go through them, so a rule such as "a lane keeps its shapes when it grows" has one home.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export const POOL_HEADER = 30;
export const LANE_HEADER = 30;
export const NEW_POOL = { width: 720, laneHeight: 160 } as const;

const int = (n: number) => Math.round(n);
const clampCoord = (n: number) =>
  Math.max(-DIAGRAM_LIMITS.coordinate, Math.min(DIAGRAM_LIMITS.coordinate, int(n)));

export const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const contains = (r: Rect, pt: Point) =>
  pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height;

/** Where a flow leaves or enters a shape: the middle of that side, which is on every symbol's outline. */
export function sidePoint(r: Rect, side: Side): Point {
  if (side === "top") return { x: r.x + r.width / 2, y: r.y };
  if (side === "bottom") return { x: r.x + r.width / 2, y: r.y + r.height };
  if (side === "left") return { x: r.x, y: r.y + r.height / 2 };
  return { x: r.x + r.width, y: r.y + r.height / 2 };
}

export const poolRect = (pool: BpmnPool): Rect => ({
  x: pool.x,
  y: pool.y,
  width: pool.width,
  height: poolHeight(pool),
});

/** Each lane's band, top to bottom, across the pool's whole width. */
export function laneRects(pool: BpmnPool): (Rect & { laneId: string })[] {
  let y = pool.y;
  return pool.lanes.map((lane) => {
    const rect = { laneId: lane.id, x: pool.x, y, width: pool.width, height: lane.height };
    y += lane.height;
    return rect;
  });
}

/** The pool and lane a point falls in; the pool added last wins where two overlap. */
export function laneAt(diagram: BpmnDiagram, pt: Point): { poolId: string; laneId: string } | null {
  for (let i = diagram.pools.length - 1; i >= 0; i--) {
    const pool = diagram.pools[i]!;
    const lane = laneRects(pool).find((rect) => contains(rect, pt));
    if (lane) return { poolId: pool.id, laneId: lane.laneId };
  }
  return null;
}

/** Shapes whose centre lies in the rectangle. */
export const shapesIn = (diagram: BpmnDiagram, rect: Rect) =>
  diagram.shapes.filter((shape) => contains(rect, centre(shape))).map((shape) => shape.id);

export const canAddShape = (diagram: BpmnDiagram) => diagram.shapes.length < DIAGRAM_LIMITS.shapes;
export const canAddFlow = (diagram: BpmnDiagram) => diagram.flows.length < DIAGRAM_LIMITS.flows;
export const canAddPool = (diagram: BpmnDiagram) => diagram.pools.length < DIAGRAM_LIMITS.pools;

export function addShape(
  diagram: BpmnDiagram,
  kind: ShapeKind,
  at: Point,
  id: string,
  label = "",
): BpmnDiagram {
  if (!canAddShape(diagram)) return diagram;
  const { width, height } = SHAPE_SPECS[kind];
  const shape: BpmnShape = {
    id,
    kind,
    x: clampCoord(at.x - width / 2),
    y: clampCoord(at.y - height / 2),
    width,
    height,
    label,
  };
  return { ...diagram, shapes: [...diagram.shapes, shape] };
}

export function moveShapes(diagram: BpmnDiagram, moves: ReadonlyMap<string, Point>): BpmnDiagram {
  if (moves.size === 0) return diagram;
  return {
    ...diagram,
    shapes: diagram.shapes.map((shape) => {
      const to = moves.get(shape.id);
      return to ? { ...shape, x: clampCoord(to.x), y: clampCoord(to.y) } : shape;
    }),
  };
}

const clampSize = (n: number) =>
  Math.max(DIAGRAM_LIMITS.minSize, Math.min(DIAGRAM_LIMITS.maxSize, int(n)));

export function resizeShape(diagram: BpmnDiagram, id: string, rect: Rect): BpmnDiagram {
  return {
    ...diagram,
    shapes: diagram.shapes.map((shape) =>
      shape.id === id
        ? {
            ...shape,
            x: clampCoord(rect.x),
            y: clampCoord(rect.y),
            width: clampSize(rect.width),
            height: clampSize(rect.height),
          }
        : shape,
    ),
  };
}

const cut = (text: string) => text.slice(0, DIAGRAM_LIMITS.label);
const cutName = (text: string) => text.trim().slice(0, DIAGRAM_LIMITS.name);

export const setShapeLabel = (diagram: BpmnDiagram, id: string, label: string): BpmnDiagram => ({
  ...diagram,
  shapes: diagram.shapes.map((shape) =>
    shape.id === id ? { ...shape, label: cut(label) } : shape,
  ),
});

export type NewFlow = Omit<BpmnFlow, "label"> & { label?: string };

/** A flow between two different shapes that are not already joined the same way in that direction. */
export function connect(diagram: BpmnDiagram, flow: NewFlow): BpmnDiagram {
  const ids = new Set(diagram.shapes.map((shape) => shape.id));
  if (!canAddFlow(diagram) || flow.source === flow.target) return diagram;
  if (!ids.has(flow.source) || !ids.has(flow.target)) return diagram;
  const twin = diagram.flows.some(
    (each) => each.source === flow.source && each.target === flow.target && each.kind === flow.kind,
  );
  if (twin) return diagram;
  return { ...diagram, flows: [...diagram.flows, { ...flow, label: cut(flow.label ?? "") }] };
}

export const setFlowLabel = (diagram: BpmnDiagram, id: string, label: string): BpmnDiagram => ({
  ...diagram,
  flows: diagram.flows.map((flow) => (flow.id === id ? { ...flow, label: cut(label) } : flow)),
});

export const setFlowKind = (diagram: BpmnDiagram, id: string, kind: FlowKind): BpmnDiagram => ({
  ...diagram,
  flows: diagram.flows.map((flow) => (flow.id === id ? { ...flow, kind } : flow)),
});

export function reconnect(
  diagram: BpmnDiagram,
  id: string,
  ends: { source: string; target: string; sourceSide: Side; targetSide: Side },
): BpmnDiagram {
  if (ends.source === ends.target) return diagram;
  const ids = new Set(diagram.shapes.map((shape) => shape.id));
  if (!ids.has(ends.source) || !ids.has(ends.target)) return diagram;
  return {
    ...diagram,
    flows: diagram.flows.map((flow) => (flow.id === id ? { ...flow, ...ends } : flow)),
  };
}

/** A pool with two lanes, its top left at `at`. */
export function addPool(
  diagram: BpmnDiagram,
  at: Point,
  ids: { pool: string; lanes: [string, string] },
  names: { pool: string; lane: (n: number) => string },
): BpmnDiagram {
  if (!canAddPool(diagram)) return diagram;
  const pool: BpmnPool = {
    id: ids.pool,
    name: cutName(names.pool),
    x: clampCoord(at.x),
    y: clampCoord(at.y),
    width: NEW_POOL.width,
    lanes: ids.lanes.map((id, i) => ({
      id,
      name: cutName(names.lane(i + 1)),
      height: NEW_POOL.laneHeight,
    })),
  };
  return { ...diagram, pools: [...diagram.pools, pool] };
}

const mapPool = (diagram: BpmnDiagram, poolId: string, change: (pool: BpmnPool) => BpmnPool) => ({
  ...diagram,
  pools: diagram.pools.map((pool) => (pool.id === poolId ? change(pool) : pool)),
});

export function addLane(
  diagram: BpmnDiagram,
  poolId: string,
  laneId: string,
  name: string,
): BpmnDiagram {
  return mapPool(diagram, poolId, (pool) =>
    pool.lanes.length >= DIAGRAM_LIMITS.lanesPerPool
      ? pool
      : {
          ...pool,
          lanes: [...pool.lanes, { id: laneId, name: cutName(name), height: NEW_POOL.laneHeight }],
        },
  );
}

/** A pool keeps at least one lane; the shapes that were in the lane stay where they are. */
export const removeLane = (diagram: BpmnDiagram, poolId: string, laneId: string): BpmnDiagram =>
  mapPool(diagram, poolId, (pool) =>
    pool.lanes.length <= 1 ? pool : { ...pool, lanes: pool.lanes.filter((l) => l.id !== laneId) },
  );

export const renamePool = (diagram: BpmnDiagram, poolId: string, name: string): BpmnDiagram =>
  mapPool(diagram, poolId, (pool) => ({ ...pool, name: cutName(name) }));

export const renameLane = (
  diagram: BpmnDiagram,
  poolId: string,
  laneId: string,
  name: string,
): BpmnDiagram =>
  mapPool(diagram, poolId, (pool) => ({
    ...pool,
    lanes: pool.lanes.map((lane) => (lane.id === laneId ? { ...lane, name: cutName(name) } : lane)),
  }));

/**
 * Sets one lane's height. The lanes below it, and the shapes in them, move by the difference, so
 * every shape stays in the lane it was in.
 */
export function resizeLane(
  diagram: BpmnDiagram,
  poolId: string,
  laneId: string,
  height: number,
): BpmnDiagram {
  const pool = diagram.pools.find((each) => each.id === poolId);
  const index = pool?.lanes.findIndex((lane) => lane.id === laneId) ?? -1;
  if (!pool || index < 0) return diagram;
  const next = Math.max(DIAGRAM_LIMITS.minLane, Math.min(DIAGRAM_LIMITS.maxSize, int(height)));
  const delta = next - pool.lanes[index]!.height;
  if (delta === 0) return diagram;
  const below = laneRects(pool).slice(index + 1);
  const shifted = new Set(below.flatMap((rect) => shapesIn(diagram, rect)));
  return {
    ...mapPool(diagram, poolId, (each) => ({
      ...each,
      lanes: each.lanes.map((lane, i) => (i === index ? { ...lane, height: next } : lane)),
    })),
    shapes: diagram.shapes.map((shape) =>
      shifted.has(shape.id) ? { ...shape, y: clampCoord(shape.y + delta) } : shape,
    ),
  };
}

export const resizePoolWidth = (diagram: BpmnDiagram, poolId: string, width: number) =>
  mapPool(diagram, poolId, (pool) => ({
    ...pool,
    width: Math.max(POOL_HEADER + LANE_HEADER + 60, clampSize(width)),
  }));

/** Moves a pool and the shapes inside it, except the ones in `alsoMoving`, which move themselves. */
export function movePool(
  diagram: BpmnDiagram,
  poolId: string,
  to: Point,
  alsoMoving: ReadonlySet<string> = new Set(),
): BpmnDiagram {
  const pool = diagram.pools.find((each) => each.id === poolId);
  if (!pool) return diagram;
  const dx = clampCoord(to.x) - pool.x;
  const dy = clampCoord(to.y) - pool.y;
  if (dx === 0 && dy === 0) return diagram;
  const inside = new Set(shapesIn(diagram, poolRect(pool)).filter((id) => !alsoMoving.has(id)));
  return {
    ...mapPool(diagram, poolId, (each) => ({ ...each, x: each.x + dx, y: each.y + dy })),
    shapes: diagram.shapes.map((shape) =>
      inside.has(shape.id)
        ? { ...shape, x: clampCoord(shape.x + dx), y: clampCoord(shape.y + dy) }
        : shape,
    ),
  };
}

/**
 * Removes shapes, flows and pools by id. A removed shape takes its flows with it; a removed pool
 * leaves its shapes on the canvas, so deleting a frame never deletes the work drawn in it.
 */
export function removeElements(diagram: BpmnDiagram, ids: ReadonlySet<string>): BpmnDiagram {
  if (ids.size === 0) return diagram;
  const shapes = diagram.shapes.filter((shape) => !ids.has(shape.id));
  const kept = new Set(shapes.map((shape) => shape.id));
  return {
    ...diagram,
    pools: diagram.pools.filter((pool) => !ids.has(pool.id)),
    shapes,
    flows: diagram.flows.filter(
      (flow) => !ids.has(flow.id) && kept.has(flow.source) && kept.has(flow.target),
    ),
  };
}

/** The smallest rectangle around everything drawn, or null for an empty diagram. */
export function diagramBounds(diagram: BpmnDiagram): Rect | null {
  const rects: Rect[] = [...diagram.pools.map(poolRect), ...diagram.shapes];
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
