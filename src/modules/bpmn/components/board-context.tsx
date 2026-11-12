"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

/** What the shape, pool and connector views ask the board to do. One gesture is one Undo step. */
export interface BoardActions {
  canEdit: boolean;
  editingId: string | null;
  startEdit: (id: string) => void;
  stopEdit: () => void;
  setShapeLabel: (id: string, text: string) => void;
  setFlowLabel: (id: string, text: string) => void;
  renamePool: (poolId: string, name: string) => void;
  renameLane: (poolId: string, laneId: string, name: string) => void;
  addLane: (poolId: string) => void;
  removeLane: (poolId: string, laneId: string) => void;
  resizeLane: (poolId: string, laneId: string, height: number) => void;
  beginGesture: () => void;
  endGesture: () => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const board = useContext(BoardContext);
  if (!board) throw new Error("useBoard outside the BPMN board");
  return board;
}

/**
 * Text typed onto the canvas. Enter keeps it (Shift+Enter starts a new line where `multiline`),
 * Escape drops it, and leaving the box keeps it.
 */
export function InlineText({
  value,
  label,
  multiline = false,
  maxLength,
  className = "",
  onCommit,
  onCancel,
}: {
  value: string;
  label: string;
  multiline?: boolean;
  maxLength: number;
  className?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };
  const keyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      done.current = true;
      onCancel();
    } else if (event.key === "Enter" && !(multiline && event.shiftKey)) {
      event.preventDefault();
      commit();
    }
  };
  const shared = {
    "aria-label": label,
    "data-testid": "bpmn-text-input",
    value: text,
    maxLength,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setText(event.target.value),
    onBlur: commit,
    onKeyDown: keyDown,
    className: `nodrag nopan nowheel rounded border border-accent bg-surface px-1 text-xs text-ink outline-none ${className}`,
  };
  return multiline ? <textarea ref={ref} rows={3} {...shared} /> : <input ref={ref} {...shared} />;
}
