"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { messages } from "@/lib/messages";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

interface UnsavedScopeValue {
  report: (part: string, dirty: boolean) => void;
  leave: (navigate: () => void) => void;
  forgetAll: () => void;
}

const UnsavedScopeContext = createContext<UnsavedScopeValue | null>(null);

/**
 * One unsaved-changes guard for a page with several forms (the meeting
 * workspace's header and participant panel). Each guard dispatches its own
 * before-navigate event, so two would ask twice; here the parts report whether
 * they are dirty and the scope asks once for all of them.
 */
export function UnsavedChangesScope({ children }: { children: React.ReactNode }) {
  const { markDirty, markClean } = useUnsavedChangesGuard();
  const partsRef = useRef(new Set<string>());
  const pendingRef = useRef<(() => void) | null>(null);
  const [asking, setAsking] = useState(false);

  const report = useCallback(
    (part: string, dirty: boolean) => {
      const parts = partsRef.current;
      if (dirty) parts.add(part);
      else parts.delete(part);
      if (parts.size > 0) markDirty();
      else markClean();
    },
    [markDirty, markClean],
  );

  const forgetAll = useCallback(() => {
    partsRef.current.clear();
    markClean();
  }, [markClean]);

  const leave = useCallback((navigate: () => void) => {
    if (partsRef.current.size === 0) {
      navigate();
      return;
    }
    pendingRef.current = navigate;
    setAsking(true);
  }, []);

  useEffect(() => {
    function onBeforeNavigate(event: Event) {
      if (partsRef.current.size === 0) return;
      event.preventDefault();
      const detail = (event as CustomEvent<{ resume?: unknown }>).detail;
      pendingRef.current =
        typeof detail?.resume === "function" ? (detail.resume as () => void) : null;
      setAsking(true);
    }
    window.addEventListener("before-navigate", onBeforeNavigate);
    return () => window.removeEventListener("before-navigate", onBeforeNavigate);
  }, []);

  const discard = () => {
    const resume = pendingRef.current;
    pendingRef.current = null;
    setAsking(false);
    forgetAll();
    resume?.();
  };

  const value = useMemo(() => ({ report, leave, forgetAll }), [report, leave, forgetAll]);

  return (
    <UnsavedScopeContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) pendingRef.current = null;
        }}
        title={messages.feedback.unsavedChangesTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={discard}
      />
    </UnsavedScopeContext.Provider>
  );
}

/**
 * Reports one form's unsaved changes to the surrounding UnsavedChangesScope.
 * markClean is synchronous, for a save that navigates at once; forgetAll
 * drops every part's changes, for a delete that takes the page away;
 * leave(navigate) asks first when anything on the page is unsaved.
 */
export function useUnsavedPart(part: string, dirty: boolean) {
  const scope = useContext(UnsavedScopeContext);
  if (!scope) throw new Error("useUnsavedPart needs an UnsavedChangesScope");
  const { report, leave, forgetAll } = scope;

  useEffect(() => {
    report(part, dirty);
  }, [report, part, dirty]);
  useEffect(() => () => report(part, false), [report, part]);

  const markClean = useCallback(() => report(part, false), [report, part]);
  return { leave, markClean, forgetAll };
}
