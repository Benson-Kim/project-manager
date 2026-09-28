"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { messages } from "@/lib/messages";
import type { useZodForm } from "./use-zod-form";

type ZodFormHandle = ReturnType<typeof useZodForm>;

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

/**
 * Shared form-action plumbing for Sheet components:
 *   - handles pending state
 *   - maps action errors → form.setErrors / summary message
 *   - surfaces the CONFLICT reload prompt
 *   - wires the delete confirmation flow
 *
 * Usage: destructure the returned values and wire them to buttons / ConfirmDialog.
 */
export function useSheetFormActions<TCreate, TUpdate, TDelete>({
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

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const valid = form.validate(data);
      if (!valid) return;

      startTransition(async () => {
        setSummary(null);
        setConflict(false);
        const result = isEdit
          ? await updateAction(data)
          : await createAction(data);

        if (result.ok) {
          onSuccess();
          router.refresh();
        } else {
          const { code, message, fieldErrors } = result.error;
          if (code === "CONFLICT") {
            setConflict(true);
            setSummary(messages.errors.CONFLICT);
          } else if (code === "VALIDATION" && fieldErrors) {
            form.setErrors(fieldErrors);
            setSummary(messages.errors.summaryTitle);
          } else {
            setSummary(message ?? messages.errors.INTERNAL);
          }
        }
      });
    },
    [isEdit, createAction, updateAction, onSuccess, form, router],
  );

  const onDelete = useCallback(() => {
    startTransition(async () => {
      setSummary(null);
      const result = await deleteAction(undefined as unknown as TDelete);
      if (result.ok) {
        setConfirmDelete(false);
        onSuccess();
        router.refresh();
      } else {
        setConfirmDelete(false);
        setSummary(result.error.message ?? messages.errors.INTERNAL);
      }
    });
  }, [deleteAction, onSuccess, router]);

  return { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete };
}
