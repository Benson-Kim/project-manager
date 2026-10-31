"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NotePopover } from "@/components/ui/note-popover";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { setPlanNoteAction } from "../actions";
import { MAX_NOTE_LENGTH } from "../schemas/key-deliverable";
import { PaperclipIcon } from "./wbs-box-note";
import { firstError } from "./wbs-queue";

/**
 * The project's sticky note beside the work breakdown (ADR-0052). Each save carries the project's
 * row version and takes the new one back, so the next autosave is not refused as stale. A refusal
 * (someone changed the project meanwhile) says so and fetches the page again, so a retry carries
 * the newer version.
 */
export function PlanNote({
  projectId,
  note,
  rowVer,
  canEdit,
}: {
  projectId: number;
  note: string | null;
  rowVer: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const version = useRef(rowVer);
  // A refresh can answer with an older version than a save already took back.
  useEffect(() => {
    version.current = Math.max(version.current, rowVer);
  }, [rowVer]);

  if (!canEdit && !note) return null;

  async function save(text: string): Promise<boolean> {
    let result: Awaited<ReturnType<typeof setPlanNoteAction>>;
    try {
      result = await setPlanNoteAction({ projectId, note: text, rowVer: version.current });
    } catch {
      toast({ variant: "error", title: messages.errors.INTERNAL });
      return false;
    }
    if (result.ok) {
      version.current = result.data.rowVer;
      return true;
    }
    toast({ variant: "error", title: firstError(result.error) });
    router.refresh();
    return false;
  }

  return (
    <NotePopover
      label={messages.keyDeliverables.wbs.note.plan}
      value={note}
      maxLength={MAX_NOTE_LENGTH}
      onSave={save}
      readOnly={!canEdit}
      testId="wbs-plan-note"
      triggerClassName="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
    >
      {note ? <PaperclipIcon /> : null}
      {messages.keyDeliverables.note}
    </NotePopover>
  );
}
