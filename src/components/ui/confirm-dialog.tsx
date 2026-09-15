"use client";

import { useRef } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { messages } from "@/lib/messages";

/**
 * The ONE destructive-confirmation pattern (STANDARDS §5.6): names the object,
 * states the consequence in one sentence, danger button carries the verb,
 * Cancel is focused by default.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. messages.confirmDelete.title("supplier", "Acme") */
  title: string;
  /** One sentence stating what happens. */
  body: string;
  /** The verb, e.g. "Delete". */
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={body}>
      <div className="flex justify-end gap-2">
        <Button
          ref={cancelRef}
          variant="secondary"
          autoFocus
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          {messages.actions.cancel}
        </Button>
        <Button variant="danger" onClick={onConfirm} pending={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
