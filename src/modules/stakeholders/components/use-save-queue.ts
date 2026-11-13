"use client";

import { useEffect, useRef, useState } from "react";

import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";

export type SaveError = Extract<ActionResult<unknown>, { ok: false }>["error"];

export interface QueuedSave<T> {
  send: () => Promise<ActionResult<T>>;
  done?: (data: T) => void;
  failed?: (error: SaveError) => void;
}

export interface SaveQueueListener {
  onCount: (waiting: number) => void;
  onRefused: (error: SaveError) => void;
}

export interface SaveQueue {
  enqueue: <T>(save: QueuedSave<T>) => void;
  idle: () => Promise<void>;
}

/** Sends one change at a time, in the order they were queued; a refused or thrown change never stops the ones after it. */
export function createSaveQueue(listener: SaveQueueListener): SaveQueue {
  let tail: Promise<void> = Promise.resolve();
  let waiting = 0;

  function enqueue<T>(save: QueuedSave<T>) {
    listener.onCount(++waiting);
    tail = tail
      .then(async () => {
        let result: ActionResult<T>;
        try {
          result = await save.send();
        } catch {
          result = { ok: false, error: { code: "INTERNAL", message: messages.errors.INTERNAL } };
        }
        try {
          if (result.ok) {
            save.done?.(result.data);
          } else {
            listener.onRefused(result.error);
            save.failed?.(result.error);
          }
        } finally {
          listener.onCount(--waiting);
        }
      })
      .catch(() => undefined);
  }

  return { enqueue, idle: () => tail };
}

/** The matrix's save queue: `saving` stays true while a change waits, and leaving the page then asks first. */
export function useSaveQueue(onRefused: (error: SaveError) => void) {
  const refused = useRef(onRefused);
  useEffect(() => {
    refused.current = onRefused;
  }, [onRefused]);

  const [waiting, setWaiting] = useState(0);
  const queue = useRef<SaveQueue | null>(null);
  const saving = waiting > 0;

  function enqueue<T>(save: QueuedSave<T>) {
    queue.current ??= createSaveQueue({
      onCount: setWaiting,
      onRefused: (error) => refused.current(error),
    });
    queue.current.enqueue(save);
  }

  useEffect(() => {
    if (!saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = messages.feedback.unsavedChangesBody;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  return { enqueue, saving };
}
