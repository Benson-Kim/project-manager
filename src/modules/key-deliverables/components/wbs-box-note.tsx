"use client";

import { NotePopover } from "@/components/ui/note-popover";
import { messages } from "@/lib/messages";
import { MAX_NOTE_LENGTH } from "../schemas/key-deliverable";

const W = messages.keyDeliverables.wbs;

/** React events bubble through the note's portal: a press or key in it must not drag, rename or
 *  open the menu of the box around it. */
export function keepInside(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 4.5l-5 5a1.8 1.8 0 002.6 2.6l5-5a3.2 3.2 0 00-4.5-4.5l-5.2 5.2a4.5 4.5 0 006.4 6.4l4-4" />
    </svg>
  );
}

/**
 * The paperclip on a box (ADR-0052): it means the item has a note, so it shows only then. With
 * `offerAdd` (the details panel), someone who may write one gets an "Add note" button instead.
 * Others read the note without editing it.
 */
export function BoxNote({
  id,
  code,
  note,
  offerAdd,
  canEdit,
  tabbable,
  onSave,
  testId = `wbs-note-${id}`,
}: {
  id: number;
  code: string;
  note: string | null;
  offerAdd: boolean;
  canEdit: boolean;
  tabbable: boolean;
  onSave: (text: string) => Promise<boolean>;
  testId?: string;
}) {
  if (!note && !(offerAdd && canEdit)) return null;
  return (
    <span
      className="contents"
      onPointerDown={keepInside}
      onDoubleClick={keepInside}
      onContextMenu={keepInside}
      onKeyDown={keepInside}
    >
      <NotePopover
        label={note ? W.note.of(code) : W.note.add(code)}
        value={note}
        maxLength={MAX_NOTE_LENGTH}
        onSave={onSave}
        readOnly={!canEdit}
        tabIndex={tabbable ? 0 : -1}
        testId={testId}
        triggerClassName={`-my-0.5 flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-coral ${
          note ? "w-6 text-ink" : "px-1.5 text-xs font-medium text-ink-muted print:hidden"
        }`}
      >
        {note ? <PaperclipIcon /> : W.note.addShort}
      </NotePopover>
    </span>
  );
}
