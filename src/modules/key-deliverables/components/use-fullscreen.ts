"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Full screen for one view. The whole page goes full screen, not the view's element, because
 * menus, dialogs, sheets and toasts render at the end of the page and the browser draws nothing
 * outside a full-screen element; the caller pins its view over the page while `active`.
 * `supported` is false where the page may not go full screen: the caller then offers no button.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSupported(document.fullscreenEnabled === true));
    // Escape and the browser's own controls leave full screen without asking this view.
    const follow = () => {
      const on = asked.current && document.fullscreenElement !== null;
      asked.current = on;
      setActive(on);
    };
    document.addEventListener("fullscreenchange", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", follow);
      if (asked.current && document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (asked.current && document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        asked.current = true;
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Refused (no user gesture, or a policy): the view stays as it is.
      asked.current = document.fullscreenElement !== null && asked.current;
    }
  }, []);

  return { active, supported, toggle };
}
