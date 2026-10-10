"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import { useAnnouncer } from "@/components/ui/announcer";
import { useToast } from "@/components/ui/toast";
import type { useZodForm } from "./use-zod-form";

type ZodFormHandle = ReturnType<typeof useZodForm>;

/**
 * Shared form-action plumbing for Sheet components:
 *   - handles pending state
 *   - confirms a save or delete with a success toast and an announcement (ADR-0008)
 *   - shows the error summary when client-side validation fails
 *   - maps action errors → form.setErrors / summary message
 *   - surfaces the CONFLICT reload prompt
 *   - wires the delete confirmation flow
 *
 * Usage: destructure the returned values and wire them to buttons / ConfirmDialog.
 */
export function useSheetFormActions<TCreate, TUpdate, TDelete = void>({
  isEdit,
  onSuccess,
  form,
  createAction,
  updateAction,
  deleteAction,
}: {
  isEdit: boolean;
  onSuccess: () => void;
  form: ZodFormHandle;
  createAction: (data: FormData) => Promise<ActionResult<TCreate>>;
  updateAction: (data: FormData) => Promise<ActionResult<TUpdate>>;
  deleteAction: (args: TDelete) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const confirm = useCallback(
    (title: string) => {
      toast({ variant: "success", title });
      announce(title);
    },
    [toast, announce],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formElement = e.currentTarget;
      const valid = form.validate(formElement);
      if (!valid) {
        setSummary(messages.errors.summaryTitle);
        return;
      }

      const data = new FormData(formElement);
      startTransition(async () => {
        setSummary(null);
        setConflict(false);
        const result = isEdit ? await updateAction(data) : await createAction(data);

        if (result.ok) {
          confirm(isEdit ? messages.feedback.saved : messages.feedback.created);
          onSuccess();
          router.refresh();
        } else {
          const { code, message } = result.error;
          if (code === "CONFLICT") {
            setConflict(true);
            setSummary(messages.errors.CONFLICT);
          } else if (code === "VALIDATION") {
            form.applyResult(result);
            setSummary(messages.errors.summaryTitle);
          } else {
            setSummary(message ?? messages.errors.INTERNAL);
          }
        }
      });
    },
    [isEdit, createAction, updateAction, onSuccess, form, router, confirm],
  );

  const onDelete = useCallback(
    (args: TDelete) => {
      startTransition(async () => {
        setSummary(null);
        const result = await deleteAction(args);
        if (result.ok) {
          setConfirmDelete(false);
          confirm(messages.feedback.deleted);
          onSuccess();
          router.refresh();
        } else {
          setConfirmDelete(false);
          setSummary(result.error.message ?? messages.errors.INTERNAL);
        }
      });
    },
    [deleteAction, onSuccess, router, confirm],
  );

  return { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete };
}
