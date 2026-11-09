"use client";

import { useEffect, useRef } from "react";

/**
 * While `active`, the caller pins its view over the page as a CSS layer and Escape calls `exit`.
 * The layer sits inside <main>, its own stacking context, so it cannot out-stack the app-shell
 * header: the root is marked, as native fullscreen marks :root:fullscreen, and the header steps aside.
 */
export function useFullPage(active: boolean, exit: () => void) {
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.canvasFullscreen = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) exitRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      delete root.dataset.canvasFullscreen;
    };
  }, [active]);
}
