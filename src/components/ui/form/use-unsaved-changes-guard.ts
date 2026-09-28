"use client";

import { useCallback, useEffect, useRef } from "react";
import { messages } from "@/lib/messages";

/**
 * Attaches a beforeunload guard when the form has unsaved changes.
 *
 * Two usage patterns are supported:
 *
 * 1. **Reactive** — pass a boolean `isDirty` state value directly:
 *    `useUnsavedChangesGuard(isDirty)`
 *    The guard activates/deactivates whenever `isDirty` changes.
 *
 * 2. **Imperative** — call with no argument; use the returned
 *    `markDirty` / `markClean` helpers to drive the guard:
 *    ```
 *    const { markDirty, markClean } = useUnsavedChangesGuard();
 *    ```
 *
 * The guard is intentionally lightweight — browsers control the dialog text
 * on modern platforms; we only pass our copy as the deprecated `returnValue`.
 */
export function useUnsavedChangesGuard(isDirty?: boolean) {
  const dirtyRef = useRef(isDirty ?? false);

  // Keep the ref in sync when the reactive form is used.
  useEffect(() => {
    if (isDirty !== undefined) {
      dirtyRef.current = isDirty;
    }
  }, [isDirty]);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!dirtyRef.current) return;
    e.preventDefault();
    // Legacy support: Chrome requires returnValue to be set.
    e.returnValue = messages.feedback.unsavedChangesBody;
  }, []);

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [handleBeforeUnload]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return { markDirty, markClean };
}
