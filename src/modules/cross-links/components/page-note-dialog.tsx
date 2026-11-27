"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { messages } from "@/lib/messages";
import { MAX_PAGE_NOTE_LEN, STICKY_COLORS, type StickyColor } from "../schemas/location";
import { createPageNoteInput } from "../schemas/page-note";
import { STICKY_COLOR_STYLES } from "./color-tokens";

export interface PageNoteDialogProps {
  open: boolean;
  mode: "create" | "edit";
  anchorLabel: string;
  initialBody?: string;
  initialColor?: StickyColor;
  pending?: boolean;
  serverError?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { body: string; color: StickyColor }) => Promise<void> | void;
  onRequestDelete?: () => void;
}

export function StickyColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: StickyColor;
  onChange: (next: StickyColor) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-ink-muted">
        {messages.crossLinks.dialogColorLabel}
      </legend>
      <div className="flex flex-wrap gap-2">
        {STICKY_COLORS.map((color) => {
          const style = STICKY_COLOR_STYLES[color];
          const selected = value === color;
          return (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(color)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${style.chipClass} ${
                selected
                  ? "ring-2 ring-focus ring-offset-1 ring-offset-surface"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: style.dotColorVar }}
              />
              <span>{style.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PageNoteForm({
  mode,
  anchorLabel,
  initialBody,
  initialColor,
  pending,
  serverError,
  onCancel,
  onSubmit,
  onRequestDelete,
}: {
  mode: "create" | "edit";
  anchorLabel: string;
  initialBody: string;
  initialColor: StickyColor;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (data: { body: string; color: StickyColor }) => Promise<void> | void;
  onRequestDelete?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [color, setColor] = useState<StickyColor>(initialColor);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = localError ?? serverError;
  const bodyFieldId = "page-note-dialog-body";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const check = createPageNoteInput.shape.body.safeParse(body);
    if (!check.success) {
      const firstMsg = check.error.issues[0]?.message ?? messages.crossLinks.requiredError;
      if (firstMsg.includes("HTML")) setLocalError(messages.crossLinks.plainTextError);
      else if (firstMsg.includes("Required")) setLocalError(messages.crossLinks.requiredError);
      else setLocalError(messages.crossLinks.tooLongError);
      return;
    }
    await onSubmit({ body: check.data, color });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        <span className="font-medium text-ink">{messages.crossLinks.dialogAnchorLabel}: </span>
        <span>{anchorLabel}</span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={bodyFieldId} className="block text-xs font-medium text-ink">
          {messages.crossLinks.dialogNoteBodyLabel}
        </label>
        <textarea
          id={bodyFieldId}
          rows={4}
          maxLength={MAX_PAGE_NOTE_LEN}
          value={body}
          disabled={pending}
          autoFocus
          placeholder={messages.crossLinks.dialogNoteBodyPlaceholder}
          onChange={(e) => {
            setBody(e.target.value);
            if (localError) setLocalError(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none"
        />
        <p className="text-right text-[11px] text-ink-faint">
          {body.length}/{MAX_PAGE_NOTE_LEN}
        </p>
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

export function PageNoteDialog({
  open,
  mode,
  anchorLabel,
  initialBody = "",
  initialColor = "yellow",
  pending = false,
  serverError = null,
  onOpenChange,
  onSubmit,
  onRequestDelete,
}: PageNoteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        mode === "create"
          ? messages.crossLinks.dialogCreateNoteTitle
          : messages.crossLinks.dialogEditNoteTitle
      }
    >
      {open ? (
        <PageNoteForm
          key={`${mode}:${anchorLabel}:${initialBody}:${initialColor}`}
          mode={mode}
          anchorLabel={anchorLabel}
          initialBody={initialBody}
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
