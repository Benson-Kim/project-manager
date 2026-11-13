export type HistoryKey = "undo" | "redo";

export interface HistoryKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | ElementLike | null;
}

interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * Ctrl+Z is Undo, Ctrl+Y and Ctrl+Shift+Z are Redo (Cmd too). A text field keeps them for its own
 * typing; a role select or a button does not use them, so there they still undo the matrix.
 */
export function historyKeyOf(event: HistoryKeyEvent): HistoryKey | null {
  const key = event.key.toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || event.altKey || (key !== "z" && key !== "y")) {
    return null;
  }
  const target = event.target as ElementLike | null;
  const tag = target?.tagName?.toUpperCase();
  if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA") return null;
  return key === "z" && !event.shiftKey ? "undo" : "redo";
}
