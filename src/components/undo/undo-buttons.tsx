"use client";

import { messages } from "@/lib/messages";
import { usePageHistory } from "./page-history";

const H = messages.pageHistory;

const buttonClass =
  "flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

function ArrowIcon({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={flip ? "size-5 -scale-x-100" : "size-5"}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

/** The page's Undo and Redo, in the header of every page; each names the change it takes. */
export function UndoButtons() {
  const { undoLabel, redoLabel, busy, run } = usePageHistory();
  const undoTip = undoLabel ? `${H.undoWhat(undoLabel)} (${H.shortcutUndo})` : H.nothingToUndo;
  const redoTip = redoLabel ? `${H.redoWhat(redoLabel)} (${H.shortcutRedo})` : H.nothingToRedo;
  return (
    <div className="flex items-center" role="group" aria-label={`${H.undo} / ${H.redo}`}>
      <button
        type="button"
        className={buttonClass}
        aria-label={H.undo}
        title={undoTip}
        data-testid="page-undo"
        disabled={!undoLabel || busy}
        onClick={() => void run("undo")}
      >
        <ArrowIcon />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={H.redo}
        title={redoTip}
        data-testid="page-redo"
        disabled={!redoLabel || busy}
        onClick={() => void run("redo")}
      >
        <ArrowIcon flip />
      </button>
    </div>
  );
}
