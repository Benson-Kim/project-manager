"use client";

import { useCallback, useEffect, useRef } from "react";
import { messages } from "@/lib/messages";

/**
 * Attaches a beforeunload guard when the form has unsaved changes.
 * Returns a `markDirty` / `markClean` pair for the caller to call on
 * field change and after successful save respectively.
 *
 * The guard is intentionally lightweight — browsers control the dialog text
 * on modern platforms; we only pass our copy as the deprecated `returnValue`.
 */
export function useUnsavedChangesGuard() {
  const dirtyRef = useRef(false);

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
