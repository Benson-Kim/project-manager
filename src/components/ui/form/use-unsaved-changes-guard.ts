"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { guardedHref } from "./unsaved-guard";

/**
 * The ONE unsaved-changes guard (ADR-0009, verified for ADR-0018 Q1): while
 * `dirty`, it (a) warns on full unload via `beforeunload` and (b) intercepts
 * client-side clicks on internal links at the document capture phase — before
 * next/link's own handler — and asks for confirmation instead. The caller
 * renders a ConfirmDialog wired to `confirmOpen`/`cancel`/`discard`, and
 * routes programmatic exits (Cancel buttons) through `requestNavigation`.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // The listeners exist only while dirty (the effect re-runs on change), so
  // no ref is needed to read the latest dirty value inside the handlers.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClickCapture = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      const href = guardedHref(event, anchor, window.location.href);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  const requestNavigation = (href: string) => {
    if (dirty) setPendingHref(href);
    else router.push(href);
  };
  const cancel = () => setPendingHref(null);
  const discard = () => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  };

  return { confirmOpen: pendingHref !== null, requestNavigation, cancel, discard };
}
