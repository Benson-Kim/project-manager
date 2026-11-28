"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { messages } from "@/lib/messages";
import { MAX_LINK_NOTE_LEN, MAX_LINK_TITLE_LEN, type StickyColor } from "../schemas/location";
import { createCrossLinkInput } from "../schemas/cross-link";
import { StickyColorPicker } from "./page-note-dialog";

export interface CrossLinkDialogProps {
  open: boolean;
  mode: "create" | "edit";
  fromLabel: string;
  toLabel: string;
  initialTitle?: string;
  initialNote?: string | null;
  initialColor?: StickyColor;
  pending?: boolean;
  serverError?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    linkTitle: string;
    noteText: string | null;
    color: StickyColor;
  }) => Promise<void> | void;
  onRequestDelete?: () => void;
}

function CrossLinkForm({
  mode,
  fromLabel,
  toLabel,
  initialTitle,
  initialNote,
  initialColor,
  pending,
  serverError,
  onCancel,
  onSubmit,
  onRequestDelete,
}: {
  mode: "create" | "edit";
  fromLabel: string;
  toLabel: string;
  initialTitle: string;
  initialNote: string | null;
  initialColor: StickyColor;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (data: {
    linkTitle: string;
    noteText: string | null;
    color: StickyColor;
  }) => Promise<void> | void;
  onRequestDelete?: () => void;
}) {
  const [linkTitle, setLinkTitle] = useState(initialTitle);
  const [noteText, setNoteText] = useState(initialNote ?? "");
  const [color, setColor] = useState<StickyColor>(initialColor);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = localError ?? serverError;
  const titleId = "cross-link-dialog-title";
  const noteId = "cross-link-dialog-note";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const titleCheck = createCrossLinkInput.shape.linkTitle.safeParse(linkTitle);
    if (!titleCheck.success) {
      const msg = titleCheck.error.issues[0]?.message ?? "";
      setLocalError(
        msg.includes("HTML")
          ? messages.crossLinks.plainTextError
          : msg.includes("Required")
            ? messages.crossLinks.requiredError
            : messages.crossLinks.tooLongError,
      );
      return;
    }
    const noteCheck = createCrossLinkInput.shape.noteText.safeParse(noteText);
    if (!noteCheck.success) {
      const msg = noteCheck.error.issues[0]?.message ?? "";
      setLocalError(
        msg.includes("HTML")
          ? messages.crossLinks.plainTextError
          : messages.crossLinks.tooLongError,
      );
      return;
    }
    await onSubmit({
      linkTitle: titleCheck.data,
      noteText: noteCheck.data ?? null,
      color,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        <div className="truncate">
          <span className="font-medium text-ink">{messages.crossLinks.dialogLinkFromLabel}: </span>
          <span>{fromLabel}</span>
        </div>
        <div className="truncate">
          <span className="font-medium text-ink">{messages.crossLinks.dialogLinkToLabel}: </span>
          <span>{toLabel}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={titleId} className="block text-xs font-medium text-ink">
          {messages.crossLinks.dialogLinkTitleLabel}
        </label>
        <input
          id={titleId}
          type="text"
          maxLength={MAX_LINK_TITLE_LEN}
          value={linkTitle}
          disabled={pending}
          autoFocus
          placeholder={messages.crossLinks.dialogLinkTitlePlaceholder}
          onChange={(e) => {
            setLinkTitle(e.target.value);
            if (localError) setLocalError(null);
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={noteId} className="block text-xs font-medium text-ink">
          {messages.crossLinks.dialogLinkNoteLabel}
        </label>
        <textarea
          id={noteId}
          rows={3}
          maxLength={MAX_LINK_NOTE_LEN}
          value={noteText}
          disabled={pending}
          placeholder={messages.crossLinks.dialogLinkNotePlaceholder}
          onChange={(e) => {
            setNoteText(e.target.value);
            if (localError) setLocalError(null);
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none"
        />
      </div>

      <StickyColorPicker value={color} onChange={setColor} disabled={pending} />

      {errorText ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {errorText}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {mode === "edit" && onRequestDelete ? (
          <Button type="button" variant="destructive" onClick={onRequestDelete} disabled={pending}>
            {messages.crossLinks.deleteAction}
          </Button>
        ) : (
          <span />
        )}
        <DialogActions onCancel={onCancel}>
          <Button type="submit" pending={pending}>
            {messages.actions.save}
          </Button>
        </DialogActions>
      </div>
    </form>
  );
}

export function CrossLinkDialog({
  open,
  mode,
  fromLabel,
  toLabel,
  initialTitle = "",
  initialNote = null,
  initialColor = "yellow",
  pending = false,
  serverError = null,
  onOpenChange,
  onSubmit,
  onRequestDelete,
}: CrossLinkDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        mode === "create"
          ? messages.crossLinks.dialogCreateLinkTitle
          : messages.crossLinks.dialogEditLinkTitle
      }
    >
      {open ? (
        <CrossLinkForm
          key={`${mode}:${fromLabel}:${toLabel}:${initialTitle}:${initialNote ?? ""}:${initialColor}`}
          mode={mode}
          fromLabel={fromLabel}
          toLabel={toLabel}
          initialTitle={initialTitle}
          initialNote={initialNote}
          initialColor={initialColor}
          pending={pending}
          serverError={serverError}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          onRequestDelete={onRequestDelete}
        />
      ) : null}
    </Dialog>
  );
}
