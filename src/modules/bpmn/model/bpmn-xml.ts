import type { BpmnDiagram, BpmnFlow, BpmnShape, ShapeKind } from "./diagram";
import { centre, laneAt, laneRects, POOL_HEADER, poolRect, sidePoint, type Point } from "./edit";
import { SHAPE_SPECS } from "./shapes";
import { escapeXml } from "./svg";

/**
 * BPMN 2.0 XML for other modelling tools (ADR-0064). Each pool is a participant with its own
 * process and lane set; a shape belongs to the pool and lane its centre is in, and shapes outside
 * every pool form one more process. Positions travel as DI bounds and waypoints.
 */

const ELEMENT: Record<ShapeKind, { tag: string; definition?: string }> = {
  startEvent: { tag: "startEvent" },
  messageStartEvent: { tag: "startEvent", definition: "messageEventDefinition" },
  timerStartEvent: { tag: "startEvent", definition: "timerEventDefinition" },
  intermediateEvent: { tag: "intermediateThrowEvent" },
  timerIntermediateEvent: { tag: "intermediateCatchEvent", definition: "timerEventDefinition" },
  errorIntermediateEvent: { tag: "intermediateCatchEvent", definition: "errorEventDefinition" },
  endEvent: { tag: "endEvent" },
  terminateEndEvent: { tag: "endEvent", definition: "terminateEventDefinition" },
  task: { tag: "task" },
  userTask: { tag: "userTask" },
  serviceTask: { tag: "serviceTask" },
  scriptTask: { tag: "scriptTask" },
  subProcess: { tag: "subProcess" },
  callActivity: { tag: "callActivity" },
  exclusiveGateway: { tag: "exclusiveGateway" },
  parallelGateway: { tag: "parallelGateway" },
  inclusiveGateway: { tag: "inclusiveGateway" },
  eventBasedGateway: { tag: "eventBasedGateway" },
  dataObject: { tag: "dataObjectReference" },
  dataStore: { tag: "dataStoreReference" },
  textAnnotation: { tag: "textAnnotation" },
};

const FREE = "__free__";
const attr = (name: string, value: string) => (value ? ` ${name}="${escapeXml(value)}"` : "");
const n = (value: number) => Math.round(value);

const isFlowNode = (shape: BpmnShape) => SHAPE_SPECS[shape.kind].group !== "artifacts";

function shapeXml(shape: BpmnShape, defaultFlow: string | undefined): string {
  const { tag, definition } = ELEMENT[shape.kind];
  if (shape.kind === "textAnnotation")
    return `<bpmn:textAnnotation id="${shape.id}"><bpmn:text>${escapeXml(shape.label)}</bpmn:text></bpmn:textAnnotation>`;
  if (shape.kind === "dataObject")
    return `<bpmn:dataObject id="${shape.id}_data"/><bpmn:dataObjectReference id="${shape.id}"${attr("name", shape.label)} dataObjectRef="${shape.id}_data"/>`;
  const open = `<bpmn:${tag} id="${shape.id}"${attr("name", shape.label)}${defaultFlow ? ` default="${defaultFlow}"` : ""}`;
  return definition ? `${open}><bpmn:${definition}/></bpmn:${tag}>` : `${open}/>`;
}

function flowXml(flow: BpmnFlow): string {
  if (flow.kind === "association")
    return `<bpmn:association id="${flow.id}" sourceRef="${flow.source}" targetRef="${flow.target}"/>`;
  const tag = flow.kind === "message" ? "messageFlow" : "sequenceFlow";
  return `<bpmn:${tag} id="${flow.id}"${attr("name", flow.label)} sourceRef="${flow.source}" targetRef="${flow.target}"/>`;
}

/** Right-angled waypoints from one side point to the other, as the canvas routes them. */
export function waypoints(diagram: BpmnDiagram, flow: BpmnFlow): Point[] {
  const source = diagram.shapes.find((shape) => shape.id === flow.source)!;
  const target = diagram.shapes.find((shape) => shape.id === flow.target)!;
  const a = sidePoint(source, flow.sourceSide);
  const b = sidePoint(target, flow.targetSide);
  const across = (side: string) => side === "left" || side === "right";
  const sa = across(flow.sourceSide);
  const sb = across(flow.targetSide);
  if (a.x === b.x || a.y === b.y) return [a, b];
  if (sa && sb) {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (!sa && !sb) {
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  return sa ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

const bounds = (r: { x: number; y: number; width: number; height: number }) =>
  `<dc:Bounds x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}"/>`;

export function diagramToBpmnXml(diagram: BpmnDiagram, name: string): string {
  const owner = new Map<string, string>();
  const laneOf = new Map<string, string>();
  for (const shape of diagram.shapes) {
    const at = laneAt(diagram, centre(shape));
    owner.set(shape.id, at?.poolId ?? FREE);
    if (at) laneOf.set(shape.id, at.laneId);
  }
  const defaults = new Map<string, string>();
  for (const flow of diagram.flows)
    if (flow.kind === "default" && !defaults.has(flow.source)) defaults.set(flow.source, flow.id);

  const processIds = [...diagram.pools.map((pool) => pool.id)];
  if (diagram.pools.length === 0 || diagram.shapes.some((shape) => owner.get(shape.id) === FREE))
    processIds.push(FREE);
  const processId = (key: string) => (key === FREE ? "Process_main" : `Process_${key}`);

  const processes = processIds.map((key) => {
    const pool = diagram.pools.find((each) => each.id === key);
    const shapes = diagram.shapes.filter((shape) => owner.get(shape.id) === key);
    const flows = diagram.flows.filter(
      (flow) => flow.kind !== "message" && owner.get(flow.source) === key,
    );
    const lanes =
      pool && pool.lanes.length > 0
        ? `<bpmn:laneSet id="LaneSet_${pool.id}">${pool.lanes
            .map(
              (lane) =>
                `<bpmn:lane id="${lane.id}"${attr("name", lane.name)}>${shapes
                  .filter((shape) => isFlowNode(shape) && laneOf.get(shape.id) === lane.id)
                  .map((shape) => `<bpmn:flowNodeRef>${shape.id}</bpmn:flowNodeRef>`)
                  .join("")}</bpmn:lane>`,
            )
            .join("")}</bpmn:laneSet>`
        : "";
    return `<bpmn:process id="${processId(key)}" isExecutable="false">${lanes}${shapes
      .map((shape) => shapeXml(shape, defaults.get(shape.id)))
      .join("")}${flows.map(flowXml).join("")}</bpmn:process>`;
  });

  const messages = diagram.flows.filter((flow) => flow.kind === "message");
  const collaborate = diagram.pools.length > 0 || messages.length > 0;
  const collaboration = collaborate
    ? `<bpmn:collaboration id="Collaboration_1">${diagram.pools
        .map(
          (pool) =>
            `<bpmn:participant id="Participant_${pool.id}"${attr("name", pool.name)} processRef="${processId(pool.id)}"/>`,
        )
        .join("")}${messages.map(flowXml).join("")}</bpmn:collaboration>`
    : "";

  const shapesDi = [
    ...diagram.pools.flatMap((pool) => [
      `<bpmndi:BPMNShape id="Participant_${pool.id}_di" bpmnElement="Participant_${pool.id}" isHorizontal="true">${bounds(poolRect(pool))}</bpmndi:BPMNShape>`,
      ...laneRects(pool).map(
        (lane) =>
          `<bpmndi:BPMNShape id="${lane.laneId}_di" bpmnElement="${lane.laneId}" isHorizontal="true">${bounds({ ...lane, x: lane.x + POOL_HEADER, width: lane.width - POOL_HEADER })}</bpmndi:BPMNShape>`,
      ),
    ]),
    ...diagram.shapes.map(
      (shape) =>
        `<bpmndi:BPMNShape id="${shape.id}_di" bpmnElement="${shape.id}">${bounds(shape)}</bpmndi:BPMNShape>`,
    ),
  ];
  const edgesDi = diagram.flows.map(
    (flow) =>
      `<bpmndi:BPMNEdge id="${flow.id}_di" bpmnElement="${flow.id}">${waypoints(diagram, flow)
        .map((pt) => `<di:waypoint x="${n(pt.x)}" y="${n(pt.y)}"/>`)
        .join("")}</bpmndi:BPMNEdge>`,
  );
  const plane = collaborate ? "Collaboration_1" : processId(FREE);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="urn:project-manager:bpmn"${attr("name", name)}>`,
    collaboration,
    ...processes,
    `<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${plane}">${shapesDi.join("")}${edgesDi.join("")}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`,
    `</bpmn:definitions>`,
  ].join("\n");
}
