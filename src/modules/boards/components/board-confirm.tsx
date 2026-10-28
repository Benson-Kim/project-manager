"use client";
import { useState, useTransition } from "react";
import { z } from "zod";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { ActionResult } from "@/lib/action";

/** Asynchronous board operations compose the one shared destructive-confirmation pattern. */
export function BoardConfirm<T extends z.ZodType>({
  title,
  body,
  confirmLabel = messages.actions.delete,
  schema,
  input,
  save,
  close,
  children,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  schema: T;
  input: z.input<T>;
  save: (value: z.output<T>) => Promise<ActionResult<unknown>>;
  close: () => void;
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  return (
    <ConfirmDialog
      open
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      pending={pending}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      onConfirm={() => {
        if (pending) return;
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? messages.errors.VALIDATION);
          return;
        }
        setError(null);
        start(async () => {
          try {
            const result = await save(parsed.data);
            if (result.ok) {
              toast({ variant: "success", title: messages.feedback.saved });
              close();
            } else setError(result.error.message);
          } catch {
            setError(messages.errors.INTERNAL);
          }
        });
      }}
    >
      <ErrorSummary message={error} />
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        {children}
      </fieldset>
    </ConfirmDialog>
  );
}
