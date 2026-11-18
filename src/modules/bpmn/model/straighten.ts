import { routeBetween, sameRoute } from "@/lib/connector-route";
import type { BpmnDiagram, BpmnFlow } from "./diagram";

/** Flows chosen by a selection: those picked themselves or joining two picked shapes. */
const inScope = (flow: BpmnFlow, scope: ReadonlySet<string> | null) =>
  !scope || scope.has(flow.id) || (scope.has(flow.source) && scope.has(flow.target));

/**
 * Straighten lines: each flow in the selection, or every flow when nothing is selected, is redrawn
 * through the sides that give a straight line when its two shapes line up and a single right angle
 * when they do not. Flows keep no waypoints, so the sides are the whole route.
 */
export function straightenFlows(
  diagram: BpmnDiagram,
  scope: ReadonlySet<string> | null,
): BpmnDiagram {
  const shapes = new Map(diagram.shapes.map((shape) => [shape.id, shape]));
  let changed = false;
  const flows = diagram.flows.map((flow) => {
    const source = shapes.get(flow.source);
    const target = shapes.get(flow.target);
    if (!source || !target || !inScope(flow, scope)) return flow;
    const route = routeBetween(source, target, flow);
    if (!route || sameRoute(route, flow)) return flow;
    changed = true;
    return { ...flow, ...route };
  });
  return changed ? { ...diagram, flows } : diagram;
}

export const straightenScope = (selected: ReadonlySet<string>) =>
  selected.size > 0 ? selected : null;
