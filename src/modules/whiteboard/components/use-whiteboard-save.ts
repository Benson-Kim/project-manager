"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { notifySaved } from "@/lib/cross-window";
import { saveWhiteboardAction } from "../actions";
import { BOARD_JSON_MAX_LENGTH, type BoardScene } from "../model/scene";

export type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "conflict" | "tooLarge";

const AUTOSAVE_MS = 800;

/** Runs a write of the whiteboard's row under the version the editor holds, between its saves. */
export type WithRowVer = <T extends { RowVer: number }>(
  task: (rowVer: number) => Promise<ActionResult<T>>,
) => Promise<ActionResult<T>>;

/**
 * Saves the board a moment after each change, one save at a time, each under the version the
 * last one returned. A 409 stops saving: someone else's version is newer and only a reload shows it.
 */
export function useWhiteboardSave(
  whiteboardId: number,
  initialRowVer: number,
  board: BoardScene,
  enabled: boolean,
) {
  const rowVer = useRef(initialRowVer);
  const [initialJson] = useState(() => JSON.stringify(board));
  const savedJson = useRef(initialJson);
  const inFlight = useRef(false);
  const queued = useRef<BoardScene | null>(null);
  const stopped = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const waiting = useRef<(() => void)[]>([]);
  const wake = () => {
    for (const resume of waiting.current.splice(0)) resume();
  };

  const save = useCallback(
    async (first: BoardScene): Promise<void> => {
      if (inFlight.current) {
        queued.current = first;
        return;
      }
      try {
        let next: BoardScene | null = first;
        while (next && !stopped.current) {
          const json = JSON.stringify(next);
          if (json.length > BOARD_JSON_MAX_LENGTH) return setStatus("tooLarge");
          if (json !== savedJson.current) {
            inFlight.current = true;
            setStatus("saving");
            const result = await saveWhiteboardAction({
              whiteboardId,
              board: next,
              rowVer: rowVer.current,
            });
            inFlight.current = false;
            if (result.ok) {
              rowVer.current = result.data.RowVer;
              savedJson.current = json;
              notifySaved();
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
      } finally {
        wake();
      }
    },
    [whiteboardId],
  );

  /**
   * Runs another write of the same row (a rename) between saves: it waits for a save in flight,
   * holds autosave while it runs, takes the row's new version, then saves what was drawn meanwhile.
   */
  const withRowVer: WithRowVer = async (task) => {
    while (inFlight.current) await new Promise<void>((resume) => waiting.current.push(resume));
    inFlight.current = true;
    try {
      const result = await task(rowVer.current);
      if (result.ok) {
        rowVer.current = result.data.RowVer;
        notifySaved();
      }
      return result;
    } finally {
      inFlight.current = false;
      wake();
      const next = queued.current;
      queued.current = null;
      if (next) void save(next);
    }
  };

  useEffect(() => {
    if (!enabled || stopped.current) return;
    if (JSON.stringify(board) === savedJson.current) return;
    setStatus((current) => (current === "saving" ? current : "unsaved"));
    const timer = setTimeout(() => void save(board), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [board, enabled, save]);

  const latest = useRef(board);
  useEffect(() => {
    latest.current = board;
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
    saveNow: (scene: BoardScene = board) => save(scene),
    rowVer: () => rowVer.current,
    withRowVer,
  };
}
