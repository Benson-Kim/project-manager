"use client";

import { UndoIcon } from "@/components/ui/action-icons";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import type { EditorHistory } from "./page-history";

const H = messages.pageHistory;

const KEYS = {
  undo: { aria: "Control+Z", shown: H.shortcutUndo },
  redo: { aria: "Control+Y Control+Shift+Z", shown: H.shortcutRedo },
} as const;

/** An editor's own Undo and Redo, as icons beside its other tools. */
export function HistoryButtons({
  history,
  labels,
  testId,
  disabled = false,
}: {
  history: EditorHistory;
  labels: { undo: string; redo: string };
  /** Prefixes the buttons' test ids, as `<testId>-undo` and `<testId>-redo`. */
  testId: string;
  disabled?: boolean;
}) {
  const button = (which: "undo" | "redo") => (
    <Button
      type="button"
      size="compact"
      variant="secondary"
      data-testid={`${testId}-${which}`}
      aria-label={labels[which]}
      aria-keyshortcuts={KEYS[which].aria}
      title={`${labels[which]} (${KEYS[which].shown})`}
      disabled={disabled || !(which === "undo" ? history.canUndo : history.canRedo)}
      onClick={which === "undo" ? history.undo : history.redo}
    >
      <UndoIcon redo={which === "redo"} className="size-4" />
    </Button>
  );
  return (
    <>
      {button("undo")}
      {button("redo")}
    </>
  );
}
