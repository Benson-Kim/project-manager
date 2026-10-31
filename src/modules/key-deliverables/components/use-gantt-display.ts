"use client";

import { useCallback, useEffect, useState } from "react";
import { GANTT_DISPLAY, readGanttDisplay, type GanttDisplay } from "./gantt-layout";

const KEY = "gantt-display";

/**
 * What the Gantt shows (progress, dates, today, people, milestones), kept per
 * browser. Read after the first paint so the server and the browser draw the
 * same chart first; a browser that keeps nothing still changes it for the visit.
 */
export function useGanttDisplay(): [GanttDisplay, (change: Partial<GanttDisplay>) => void] {
  const [display, setDisplay] = useState<GanttDisplay>(GANTT_DISPLAY);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(KEY);
        if (saved) setDisplay(readGanttDisplay(JSON.parse(saved)));
      } catch {
        // Nothing kept, or unreadable: the defaults stand.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const change = useCallback((patch: Partial<GanttDisplay>) => {
    setDisplay((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // The setting still changes; only the next visit does not remember it.
      }
      return next;
    });
  }, []);

  return [display, change];
}
