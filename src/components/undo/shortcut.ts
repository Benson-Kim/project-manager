import type { Direction } from "@/lib/undo/history";

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Text boxes and rich-text editors undo their own typing; a dialog's keys belong to the dialog. */
function ownsHistoryKeys(target: ElementLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.closest?.('[role="dialog"], [role="alertdialog"], dialog'));
}

/**
 * Ctrl+Z is Undo; Ctrl+Y and Ctrl+Shift+Z are Redo (Cmd on a Mac). Null when the keys are someone
 * else's: a text box, a dialog, or an editor with its own history that already handled them.
 */
export function historyShortcut(event: KeyLike): Direction | null {
  if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return null;
  if (ownsHistoryKeys(event.target as ElementLike | null)) return null;
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return event.shiftKey ? null : "redo";
}
