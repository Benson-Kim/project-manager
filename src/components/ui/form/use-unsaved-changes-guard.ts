"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { messages } from "@/lib/messages";
import { guardedHref } from "./unsaved-guard";

/**
 * Attaches a beforeunload guard AND a same-document navigation guard when the
 * form has unsaved changes.
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
 * The guard intercepts:
 * - Tab close / hard reload (`beforeunload`)
 * - Client-side navigation in Next.js App Router (`history.pushState` /
 *   `history.replaceState` patches — C11-7 fix). When a same-document
 *   navigation is attempted while the form is dirty, the hook cancels the
 *   navigation and dispatches a `before-navigate` CustomEvent on `window`.
 *   Sheets listen for this event and show their discard-confirmation dialog.
 * - Clicks on in-app links (sidebar, section nav, breadcrumbs), caught at the
 *   document capture phase before next/link's handler (ADR-0018 Q1): the App
 *   Router renders the new route before it touches history, so the pushState
 *   patch alone cannot stop a <Link>. The same `before-navigate` event is
 *   dispatched; its `resume` performs the navigation.
 *
 * Note: browsers control the dialog text on modern platforms for beforeunload;
 * we only pass our copy as the deprecated `returnValue`.
 */
export function useUnsavedChangesGuard(isDirty?: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(isDirty ?? false);

  // Keep the ref in sync when the reactive form is used.
  useEffect(() => {
    if (isDirty !== undefined) {
      dirtyRef.current = isDirty;
    }
  }, [isDirty]);

  // ── beforeunload (tab close / hard reload) ───────────────────────────────
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

  // ── In-app link clicks (next/link) ───────────────────────────────────────
  useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const href = guardedHref(e, anchor, window.location.href);
      if (href === null) return;
      e.preventDefault();
      e.stopPropagation();
      const event = new CustomEvent("before-navigate", {
        cancelable: true,
        // Discarding: clean first, or the pushState patch below would ask again.
        detail: {
          resume: () => {
            dirtyRef.current = false;
            router.push(href);
          },
        },
      });
      window.dispatchEvent(event);
      // No form asked to confirm: navigate as the link would have.
      if (!event.defaultPrevented) router.push(href);
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [router]);

  // ── Same-document navigation (Next.js App Router client-side nav) ────────
  // Next.js App Router does not expose router.events. We patch pushState /
  // replaceState so Back / Link navigation fires the same discard check.
  useEffect(() => {
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);

    function intercept(
      original: typeof window.history.pushState,
      ...args: Parameters<typeof window.history.pushState>
    ) {
      if (dirtyRef.current) {
        // Dispatch a cancelable event. The sheet's onConfirm callback will
        // call cleanupAndNavigate() which replays the original navigation.
        const event = new CustomEvent("before-navigate", {
          cancelable: true,
          detail: { resume: () => original(...args) },
        });
        window.dispatchEvent(event);
        // If no listener called event.preventDefault(), proceed normally.
        if (!event.defaultPrevented) {
          original(...args);
        }
        return;
      }
      original(...args);
    }

    window.history.pushState = (...args) => intercept(originalPush, ...args);
    window.history.replaceState = (...args) => intercept(originalReplace, ...args);

    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
    };
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return { markDirty, markClean };
}
