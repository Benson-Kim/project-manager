"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "@/lib/messages";
import { useFullPage } from "./use-full-page";

export const FULLSCREEN_FRAME = "fixed inset-0 z-(--z-fullscreen) overflow-auto bg-surface";

export function fullscreenLabel(active: boolean): string {
  return active ? messages.actions.exitFullscreen : messages.actions.fullscreen;
}

/**
 * Full screen for one view. The whole page goes full screen, not the view's element, because
 * menus, dialogs, sheets and toasts render at the end of the page and the browser draws nothing
 * outside a full-screen element; the caller pins its view over the page (FULLSCREEN_FRAME) while
 * `active`. Where the page may not go full screen, the view is still pinned over the app.
 */
export function useFullscreen() {
  const [native, setNative] = useState(false);
  const [layer, setLayer] = useState(false);
  const asked = useRef(false);

  useFullPage(layer, () => setLayer(false));

  useEffect(() => {
    // Escape and the browser's own controls leave full screen without asking this view.
    const follow = () => {
      const on = asked.current && document.fullscreenElement !== null;
      asked.current = on;
      setNative(on);
    };
    document.addEventListener("fullscreenchange", follow);
    return () => {
      document.removeEventListener("fullscreenchange", follow);
      if (asked.current && document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);

  const toggle = useCallback(async () => {
    if (asked.current && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (layer) {
      setLayer(false);
      return;
    }
    if (document.fullscreenEnabled !== true) {
      setLayer(true);
      return;
    }
    try {
      asked.current = true;
      await document.documentElement.requestFullscreen();
    } catch {
      asked.current = false;
      setLayer(true);
    }
  }, [layer]);

  const active = native || layer;
  return { active, toggle, label: fullscreenLabel(active) };
}
