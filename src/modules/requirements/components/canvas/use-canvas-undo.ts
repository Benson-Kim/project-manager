"use client";

import { useCallback, useRef, useState } from "react";
import { dropStep, pushStep, takeStep } from "@/lib/undo-stack";
import type { CanvasUndo } from "../../canvas/undo";

type Step = CanvasUndo & { key: number };

/** Remembers a step back; the call it returns forgets it again when the server refuses the change. */
export type Remember = (step: CanvasUndo | null) => () => void;

/** The board changes Undo can take back, newest first. They live in this window only. */
export function useCanvasUndo() {
  const [stack, setStack] = useState<Step[]>([]);
  const next = useRef(0);

  const remember = useCallback<Remember>((step) => {
    if (!step) return () => {};
    const key = ++next.current;
    setStack((current) => pushStep(current, { ...step, key }));
    return () => setStack((current) => dropStep(current, key));
  }, []);

  const canUndo = (applies: (step: CanvasUndo) => boolean) => stack.some(applies);

  const take = (applies: (step: CanvasUndo) => boolean): CanvasUndo | null => {
    const { step, rest } = takeStep(stack, applies);
    setStack(rest);
    return step;
  };

  return { remember, canUndo, take };
}
