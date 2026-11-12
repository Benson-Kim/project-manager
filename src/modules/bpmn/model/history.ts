import { pushStep, takeStep } from "@/lib/undo-stack";
import type { BpmnDiagram } from "./diagram";

/**
 * Undo and Redo over whole diagrams (ADR-0064). The drawing is one document, so a step back is the
 * document as it was; the shared stack keeps the newest steps up to its limit.
 */
type Step = { key: number; diagram: BpmnDiagram };
export type History = { past: Step[]; future: Step[]; seq: number };

export const EMPTY_HISTORY: History = { past: [], future: [], seq: 0 };

const always = () => true;

/** Remembers the diagram as it was before a change; a new change drops what Redo had. */
export function record(history: History, before: BpmnDiagram): History {
  const seq = history.seq + 1;
  return { past: pushStep(history.past, { key: seq, diagram: before }), future: [], seq };
}

export function undo(
  history: History,
  present: BpmnDiagram,
): { history: History; diagram: BpmnDiagram } | null {
  const { step, rest } = takeStep(history.past, always);
  if (!step) return null;
  const seq = history.seq + 1;
  return {
    diagram: step.diagram,
    history: { past: rest, future: pushStep(history.future, { key: seq, diagram: present }), seq },
  };
}

export function redo(
  history: History,
  present: BpmnDiagram,
): { history: History; diagram: BpmnDiagram } | null {
  const { step, rest } = takeStep(history.future, always);
  if (!step) return null;
  const seq = history.seq + 1;
  return {
    diagram: step.diagram,
    history: { past: pushStep(history.past, { key: seq, diagram: present }), future: rest, seq },
  };
}
