"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import {
  handleActionResult,
  handleDeleteResult,
  type SheetFormStateConfig,
} from "./sheet-form-state";
import type { useZodForm } from "./use-zod-form";

/**
 * Thin "use client" hook that wires the pure sheet-form-state helpers to
 * React state, useRouter, useToast and useAnnouncer.
 *
 * Usage:
 *   const actions = useSheetFormActions({
 *     entity: keyword,           // existing row or null/undefined for new
 *     onSuccess: close,          // called after successful save or delete
 *     form,                      // from useZodForm(schema)
 *     createAction, updateAction, deleteAction,
 *   });
 *   // Spread or destructure: actions.onSubmit, actions.onDelete, actions.pending, …
 */
export interface UseSheetFormActionsOptions<TCreate, TDelete> {
  /**
   * Pass `true` when editing an existing record, `false` when creating.
   * Computed at the call site where the entity type is known — avoids
   * widening to `unknown` and makes the mode explicit (Tell-Don't-Ask).
   */
  isEdit: boolean;
  /** Called after a successful save or delete — typically closes the Sheet. */
  onSuccess: () => void;
  /** useZodForm return value — used for client validation + field error mapping. */
  form: ReturnType<typeof useZodForm>;
  createAction: (fd: FormData) => Promise<ActionResult<TCreate>>;
  updateAction: (fd: FormData) => Promise<ActionResult<TCreate>>;
  deleteAction: (args: TDelete) => Promise<ActionResult<unknown>>;
}

export function useSheetFormActions<TCreate, TDelete>({
  isEdit,
  onSuccess,
  form,
  createAction,
  updateAction,
  deleteAction,
}: UseSheetFormActionsOptions<TCreate, TDelete>) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cfg: SheetFormStateConfig = {
    onSuccess,
    setSummary,
    setConflict,
    toast: (msg) => toast({ variant: "success", title: msg }),
    announce,
    refresh: () => router.refresh(),
    applyResult: (r) => form.applyResult(r as ActionResult<unknown>),
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!form.validate(formElement)) {
      setSummary(messages.errors.VALIDATION);
      return;
    }
    setSummary(null);
    setConflict(false);
    const formData = new FormData(formElement);
    startTransition(async () => {
      const result = isEdit
        ? await updateAction(formData)
        : await createAction(formData);
      handleActionResult(
        result as ActionResult<unknown>,
        isEdit ? messages.feedback.saved : messages.feedback.created,
        cfg,
      );
    });
  };

  const onDelete = (deleteArgs: TDelete) => {
    startTransition(async () => {
      const result = await deleteAction(deleteArgs);
      handleDeleteResult(result, messages.feedback.deleted, setConfirmDelete, cfg);
    });
  };

  return { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete };
}
