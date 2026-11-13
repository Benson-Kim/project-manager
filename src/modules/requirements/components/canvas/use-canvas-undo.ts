"use client";

import { useCallback, useRef, useState } from "react";
import { dropStep, pushStep, takeStep } from "@/lib/undo-stack";
import type { CanvasUndo } from "../../canvas/undo";

type Step = CanvasUndo & { key: number };
type Applies = (step: CanvasUndo) => boolean;
type Back = (step: CanvasUndo) => CanvasUndo | null;

/** Remembers a step back; the call it returns forgets it again when the server refuses the change. */
export type Remember = (step: CanvasUndo | null) => () => void;

/**
 * The board changes Undo can take back and Redo can make again, newest first. They live in this
 * window only, and a new change drops what Redo had.
 */
export function useCanvasUndo() {
  const [undos, setUndos] = useState<Step[]>([]);
  const [redos, setRedos] = useState<Step[]>([]);
  const next = useRef(0);

  const keyed = useCallback((step: CanvasUndo | null): Step | null => {
    return step ? { ...step, key: ++next.current } : null;
  }, []);

  const remember = useCallback<Remember>(
    (step) => {
      const kept = keyed(step);
      if (!kept) return () => {};
      setUndos((current) => pushStep(current, kept));
      setRedos([]);
      return () => setUndos((current) => dropStep(current, kept.key));
    },
    [keyed],
  );

  const undo = (applies: Applies, back: Back): CanvasUndo | null => {
    const { step, rest } = takeStep(undos, applies);
    setUndos(rest);
    if (step) setRedos((current) => pushStep(current, keyed(back(step))));
    return step;
  };

  const redo = (applies: Applies, back: Back): CanvasUndo | null => {
    const { step, rest } = takeStep(redos, applies);
    setRedos(rest);
    if (step) setUndos((current) => pushStep(current, keyed(back(step))));
    return step;
  };

  return {
    remember,
    canUndo: (applies: Applies) => undos.some(applies),
    canRedo: (applies: Applies) => redos.some(applies),
    undo,
    redo,
  };
}
