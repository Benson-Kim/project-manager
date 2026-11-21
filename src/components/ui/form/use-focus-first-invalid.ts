"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { focusFirstInvalid } from "./focus-first-invalid";

/**
 * Focuses the first invalid control inside `root` once the render that marks it
 * has committed. A refusal that arrives after an await renders later than the
 * next animation frame, so focusing straight away would find nothing marked yet.
 */
export function useFocusFirstInvalid(root: RefObject<ParentNode | null>): () => void {
  const [requests, setRequests] = useState(0);
  useLayoutEffect(() => {
    if (requests > 0) focusFirstInvalid(root.current);
  }, [requests, root]);
  return useCallback(() => setRequests((count) => count + 1), []);
}
