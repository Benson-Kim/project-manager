"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HistoryKey } from "../schemas/responsibility-history-keys";

/**
 * Stable Undo and Redo for the header, which always run the latest `replay`; the header keeps
 * the same functions while the matrix's steps change under them.
 */
export function useLatestReplay(replay: (which: HistoryKey) => void) {
  const latest = useRef(replay);
  useEffect(() => {
    latest.current = replay;
  });
  const undo = useCallback(() => latest.current("undo"), []);
  const redo = useCallback(() => latest.current("redo"), []);
  return { undo, redo };
}
