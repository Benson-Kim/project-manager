"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDiagramAction } from "../actions";
import { DIAGRAM_LIMITS, type BpmnDiagram } from "../model/diagram";

export type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "conflict" | "tooLarge";

const AUTOSAVE_MS = 800;

/**
 * Saves the drawing a moment after each change, one save at a time, each under the version the
 * last one returned. A 409 stops saving: someone else's version is newer and only a reload shows it.
 */
export function useDiagramSave(
  diagramId: number,
  initialRowVer: number,
  diagram: BpmnDiagram,
  enabled: boolean,
) {
  const rowVer = useRef(initialRowVer);
  const [initialJson] = useState(() => JSON.stringify(diagram));
  const savedJson = useRef(initialJson);
  const inFlight = useRef(false);
  const queued = useRef<BpmnDiagram | null>(null);
  const stopped = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("saved");

  const save = useCallback(
    async (first: BpmnDiagram): Promise<void> => {
      if (inFlight.current) {
        queued.current = first;
        return;
      }
      let next: BpmnDiagram | null = first;
      while (next && !stopped.current) {
        const json = JSON.stringify(next);
        if (json.length > DIAGRAM_LIMITS.json) return setStatus("tooLarge");
        if (json !== savedJson.current) {
          inFlight.current = true;
          setStatus("saving");
          const result = await saveDiagramAction({
            diagramId,
            diagram: next,
            rowVer: rowVer.current,
          });
          inFlight.current = false;
          if (result.ok) {
            rowVer.current = result.data.RowVer;
            savedJson.current = json;
          } else if (result.error.code === "CONFLICT" || result.error.code === "NOT_FOUND") {
            stopped.current = true;
            queued.current = null;
            return setStatus("conflict");
          } else {
            queued.current = null;
            return setStatus("failed");
          }
        }
        next = queued.current;
        queued.current = null;
      }
      if (!stopped.current) setStatus("saved");
    },
    [diagramId],
  );

  useEffect(() => {
    if (!enabled || stopped.current) return;
    if (JSON.stringify(diagram) === savedJson.current) return;
    setStatus((current) => (current === "saving" ? current : "unsaved"));
    const timer = setTimeout(() => void save(diagram), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [diagram, enabled, save]);

  const latest = useRef(diagram);
  useEffect(() => {
    latest.current = diagram;
  });
  useEffect(
    () => () => {
      if (enabled && !stopped.current && JSON.stringify(latest.current) !== savedJson.current)
        void save(latest.current);
    },
    [enabled, save],
  );

  const pending = status === "unsaved" || status === "saving" || status === "failed";
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  return {
    status,
    saveNow: () => save(diagram),
    /** The version this editor last wrote, for a rename or delete of the same row. */
    rowVer: () => rowVer.current,
    adoptRowVer: (next: number) => {
      rowVer.current = next;
    },
  };
}
