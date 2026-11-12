import { z } from "zod";

/**
 * A BPMN diagram (ADR-0064) is one JSON document: pools with their lanes, shapes and flows, every
 * position absolute on the canvas. Lane membership is never stored: a shape is in the lane its
 * centre falls in, so moving a shape is the only way to change it and the two cannot disagree.
 */

export const EVENT_KINDS = [
  "startEvent",
  "messageStartEvent",
  "timerStartEvent",
  "intermediateEvent",
  "timerIntermediateEvent",
  "errorIntermediateEvent",
  "endEvent",
  "terminateEndEvent",
] as const;
export const ACTIVITY_KINDS = [
  "task",
  "userTask",
  "serviceTask",
  "scriptTask",
  "subProcess",
  "callActivity",
] as const;
export const GATEWAY_KINDS = [
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
] as const;
export const ARTIFACT_KINDS = ["dataObject", "dataStore", "textAnnotation"] as const;

export const SHAPE_KINDS = [
  ...EVENT_KINDS,
  ...ACTIVITY_KINDS,
  ...GATEWAY_KINDS,
  ...ARTIFACT_KINDS,
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const FLOW_KINDS = ["sequence", "message", "default", "association"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

export const DIAGRAM_LIMITS = {
  /** Characters of the saved JSON; the table's check holds the same number. */
  json: 300_000,
  shapes: 1_000,
  flows: 2_000,
  pools: 50,
  lanesPerPool: 50,
  label: 500,
  name: 120,
  coordinate: 100_000,
  minSize: 10,
  maxSize: 10_000,
  minLane: 60,
} as const;

export const DIAGRAM_NAME_MAX = DIAGRAM_LIMITS.name;

const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);
const coordinate = z.number().int().min(-DIAGRAM_LIMITS.coordinate).max(DIAGRAM_LIMITS.coordinate);
const size = z.number().int().min(DIAGRAM_LIMITS.minSize).max(DIAGRAM_LIMITS.maxSize);
const label = z.string().max(DIAGRAM_LIMITS.label);
const name = z.string().max(DIAGRAM_LIMITS.name);

export const shapeSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(SHAPE_KINDS),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  label,
});
export type BpmnShape = z.infer<typeof shapeSchema>;

export const flowSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(FLOW_KINDS),
  source: idSchema,
  target: idSchema,
  sourceSide: z.enum(SIDES),
  targetSide: z.enum(SIDES),
  label,
});
export type BpmnFlow = z.infer<typeof flowSchema>;

export const laneSchema = z.strictObject({
  id: idSchema,
  name,
  height: z.number().int().min(DIAGRAM_LIMITS.minLane).max(DIAGRAM_LIMITS.maxSize),
});
export type BpmnLane = z.infer<typeof laneSchema>;

export const poolSchema = z.strictObject({
  id: idSchema,
  name,
  x: coordinate,
  y: coordinate,
  width: size,
  lanes: z.array(laneSchema).min(1).max(DIAGRAM_LIMITS.lanesPerPool),
});
export type BpmnPool = z.infer<typeof poolSchema>;

/** Every id unique across the document, and every flow between two shapes that exist. */
function checkReferences(
  diagram: { pools: BpmnPool[]; shapes: BpmnShape[]; flows: BpmnFlow[] },
  ctx: z.RefinementCtx,
) {
  const ids = new Set<string>();
  const claim = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate id ${id}`, path });
    ids.add(id);
  };
  diagram.pools.forEach((pool, p) => {
    claim(pool.id, ["pools", p, "id"]);
    pool.lanes.forEach((lane, l) => claim(lane.id, ["pools", p, "lanes", l, "id"]));
  });
  diagram.shapes.forEach((shape, s) => claim(shape.id, ["shapes", s, "id"]));
  const shapeIds = new Set(diagram.shapes.map((shape) => shape.id));
  diagram.flows.forEach((flow, f) => {
    claim(flow.id, ["flows", f, "id"]);
    if (!shapeIds.has(flow.source) || !shapeIds.has(flow.target))
      ctx.addIssue({ code: "custom", message: "A flow joins a missing shape", path: ["flows", f] });
  });
}

export const diagramSchema = z
  .strictObject({
    version: z.literal(1),
    pools: z.array(poolSchema).max(DIAGRAM_LIMITS.pools),
    shapes: z.array(shapeSchema).max(DIAGRAM_LIMITS.shapes),
    flows: z.array(flowSchema).max(DIAGRAM_LIMITS.flows),
  })
  .superRefine(checkReferences)
  .refine((diagram) => JSON.stringify(diagram).length <= DIAGRAM_LIMITS.json, {
    message: "The diagram is too large to save",
  });
export type BpmnDiagram = z.infer<typeof diagramSchema>;

export const EMPTY_DIAGRAM: BpmnDiagram = { version: 1, pools: [], shapes: [], flows: [] };

/** Reads a stored document; one that no longer parses opens empty rather than breaking the page. */
export function readDiagram(json: string): { diagram: BpmnDiagram; readable: boolean } {
  try {
    const parsed = diagramSchema.safeParse(JSON.parse(json));
    if (parsed.success) return { diagram: parsed.data, readable: true };
  } catch {
    // falls through to the empty diagram
  }
  return { diagram: EMPTY_DIAGRAM, readable: false };
}

export const poolHeight = (pool: BpmnPool) =>
  pool.lanes.reduce((sum, lane) => sum + lane.height, 0);
