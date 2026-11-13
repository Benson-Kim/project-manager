import type { BpmnDiagram, BpmnShape } from "./diagram";
import { centre, laneAt } from "./edit";

/** A symbol read as a step of the process, for the swimlane and matrix views. */
export interface StepRow {
  shape: BpmnShape;
  /** The lane the step sits in, by name. */
  lane: string | null;
  /** The role it is assigned to, or else the lane it sits in. */
  role: string | null;
}

/** Every symbol but text notes, read as the canvas reads: left to right, then top to bottom. */
export function diagramSteps(diagram: BpmnDiagram): StepRow[] {
  const laneNames = new Map(
    diagram.pools.flatMap((pool) => pool.lanes.map((lane) => [lane.id, lane.name.trim()] as const)),
  );
  return diagram.shapes
    .filter((shape) => shape.kind !== "textAnnotation")
    .map((shape) => {
      const at = laneAt(diagram, centre(shape));
      const lane = (at && laneNames.get(at.laneId)) || null;
      return { shape, lane, role: shape.step?.role || lane };
    })
    .sort((a, b) => {
      const [p, q] = [centre(a.shape), centre(b.shape)];
      return p.x - q.x || p.y - q.y;
    });
}

/** Steps grouped by role, in the order each role first appears; steps with no role come last. */
export function stepsByRole(
  steps: readonly StepRow[],
): { role: string | null; steps: StepRow[] }[] {
  const groups = new Map<string | null, StepRow[]>();
  for (const step of steps) {
    const group = groups.get(step.role);
    if (group) group.push(step);
    else groups.set(step.role, [step]);
  }
  return [...groups]
    .map(([role, rows]) => ({ role, steps: rows }))
    .sort((a, b) => Number(a.role === null) - Number(b.role === null));
}
