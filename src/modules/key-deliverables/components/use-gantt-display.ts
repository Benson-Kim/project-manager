"use client";

import { useCallback, useEffect, useState } from "react";
import { GANTT_DISPLAY, readGanttDisplay, type GanttDisplay } from "./gantt-layout";

const KEY = "gantt-display";

export interface GanttDisplaySettings extends GanttDisplay {
  criticalPath: boolean;
}

export const DEFAULT_GANTT_DISPLAY: GanttDisplaySettings = {
  ...GANTT_DISPLAY,
  criticalPath: false,
};

/** Parses raw localStorage JSON for Gantt display settings, falling back to defaults. */
export function readStoredGanttDisplay(raw: string | null): GanttDisplaySettings {
  if (!raw) return { ...DEFAULT_GANTT_DISPLAY };
  try {
    return readGanttDisplay(JSON.parse(raw), DEFAULT_GANTT_DISPLAY);
  } catch {
    return { ...DEFAULT_GANTT_DISPLAY };
  }
}

/**
 * What the Gantt shows (progress, dates, today, people, milestones, critical path),
 * kept per browser. Read after the first paint so the server and the browser draw the
 * same chart first; a browser that keeps nothing still changes it for the visit.
 */
export function useGanttDisplay(): [
  GanttDisplaySettings,
  (change: Partial<GanttDisplaySettings>) => void,
] {
  const [display, setDisplay] = useState<GanttDisplaySettings>(DEFAULT_GANTT_DISPLAY);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(KEY);
        if (saved) setDisplay(readStoredGanttDisplay(saved));
      } catch {
        // Nothing kept, or unreadable: the defaults stand.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const change = useCallback((patch: Partial<GanttDisplaySettings>) => {
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
