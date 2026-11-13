"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { BpmnDiagram } from "../model/diagram";
import { EMPTY_HISTORY, record, redo, undo, type History } from "../model/history";

type State = { diagram: BpmnDiagram; history: History };

/**
 * The diagram being edited and its Undo history. A change outside a gesture is one step; changes
 * between beginGesture and endGesture (a drag, a resize) become one step when the gesture ends.
 */
export function useDiagramEditor(initial: BpmnDiagram) {
  const [state, setState] = useState<State>({ diagram: initial, history: EMPTY_HISTORY });
  const latest = useRef(state);
  const gestureBase = useRef<BpmnDiagram | null>(null);

  const set = useCallback((next: State) => {
    latest.current = next;
    setState(next);
  }, []);

  const change = useCallback(
    (edit: (diagram: BpmnDiagram) => BpmnDiagram) => {
      const current = latest.current;
      const next = edit(current.diagram);
      if (next === current.diagram) return;
      set({
        diagram: next,
        history: gestureBase.current ? current.history : record(current.history, current.diagram),
      });
    },
    [set],
  );

  const beginGesture = useCallback(() => {
    gestureBase.current ??= latest.current.diagram;
  }, []);

  const endGesture = useCallback(() => {
    const base = gestureBase.current;
    gestureBase.current = null;
    const current = latest.current;
    if (base && base !== current.diagram)
      set({ diagram: current.diagram, history: record(current.history, base) });
  }, [set]);

  const step = useCallback(
    (direction: typeof undo) => {
      gestureBase.current = null;
      const current = latest.current;
      const moved = direction(current.history, current.diagram);
      if (moved) set(moved);
    },
    [set],
  );

  const undoStep = useCallback(() => step(undo), [step]);
  const redoStep = useCallback(() => step(redo), [step]);

  return useMemo(
    () => ({
      diagram: state.diagram,
      canUndo: state.history.past.length > 0,
      canRedo: state.history.future.length > 0,
      change,
      beginGesture,
      endGesture,
      undo: undoStep,
      redo: redoStep,
    }),
    [state, change, beginGesture, endGesture, undoStep, redoStep],
  );
}

export type DiagramEditor = ReturnType<typeof useDiagramEditor>;
