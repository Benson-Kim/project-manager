"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Select, Textarea } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { ListOptions } from "@/components/ui/lookup-lists";
import type { QuestionAnswerRow } from "../schemas/question-answer";
import {
  questionAnswerFormSchema,
  updateQuestionAnswerFormSchema,
} from "../schemas/question-answer-form";
import {
  createQuestionAnswerAction,
  deleteQuestionAnswerAction,
  updateQuestionAnswerAction,
} from "../actions";

/**
 * Q&A detail/edit sheet (ADR-0010 default pattern): URL-synced via ?id=
 * (numeric id or "new"); closing clears the param. Project scope travels as a
 * hidden field. Contributor role can update but not create/delete.
 */
export function QuestionAnswerSheet({
  questionAnswer,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  questionAnswer: QuestionAnswerRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = questionAnswer ? updateQuestionAnswerFormSchema : questionAnswerFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  useUnsavedChangesGuard(isDirty);

  // Intercept same-document navigations (e.g. browser Back) when form is dirty (C11-7).
  useEffect(() => {
    function handleBeforeNavigate(e: Event) {
      if (!isDirty) return;
      e.preventDefault();
      // Runtime guard: CustomEvent<{ resume: () => void }> is not checkable at
      // compile time, so we verify the shape before trusting it.
      const detail = e instanceof CustomEvent ? (e.detail as unknown) : undefined;
      const resume =
        detail !== null &&
        typeof detail === "object" &&
        "resume" in (detail as object) &&
        typeof (detail as { resume: unknown }).resume === "function"
          ? (detail as { resume: () => void }).resume
          : undefined;
      pendingNavRef.current = resume ?? null;
      setShowUnsaved(true);
    }
    window.addEventListener("before-navigate", handleBeforeNavigate);
    return () => window.removeEventListener("before-navigate", handleBeforeNavigate);
  }, [isDirty]);

  const close = () => {
    setIsDirty(false);
    setShowUnsaved(false);
    update({ id: null });
  };

  const discardAndNavigate = () => {
    const resume = pendingNavRef.current;
    pendingNavRef.current = null;
    close();
    resume?.();
  };

  const requestClose = () => {
    if (isDirty) {
      setShowUnsaved(true);
    } else {
      close();
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!form.validate(formEl)) {
      setSummary(messages.errors.summaryTitle);
      return;
    }
    setSummary(null);
    setConflict(false);
    const data = new FormData(formEl);
    startTransition(async () => {
      const result = questionAnswer
        ? await updateQuestionAnswerAction(data)
        : await createQuestionAnswerAction(data);
      if (result.ok) {
        toast({
          variant: "success",
          title: questionAnswer ? messages.feedback.saved : messages.feedback.created,
        });
        announce(questionAnswer ? messages.feedback.saved : messages.feedback.created);
        close();
        router.refresh();
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () => {
    if (!questionAnswer) return;
    startTransition(async () => {
      const result = await deleteQuestionAnswerAction({
        questionAnswerId: questionAnswer.QuestionAnswerId,
        rowVer: questionAnswer.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        close();
        router.refresh();
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const open = isNew || questionAnswer !== null;

  // Truncate very long questions for the sheet title (no helper text rule —
  // the title is presentational, not instructional).
  const sheetTitle = questionAnswer
    ? questionAnswer.Question.length > 60
      ? questionAnswer.Question.slice(0, 57) + "…"
      : questionAnswer.Question
    : messages.questionsAnswers.newQuestion;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={sheetTitle}
      >
        <form
          noValidate
          onBlur={canEdit ? form.onBlur : undefined}
          onSubmit={onSubmit}
          data-testid="question-answer-form"
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} />
          {conflict ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                {messages.questionsAnswers.reload}
              </Button>
            </div>
          ) : null}

          {/* Hidden fields */}
          <input type="hidden" name="projectId" value={questionAnswer?.ProjectId ?? projectId} />
          {questionAnswer ? (
            <>
              <input
                type="hidden"
                name="questionAnswerId"
                value={questionAnswer.QuestionAnswerId}
              />
              <input type="hidden" name="rowVer" value={questionAnswer.RowVer} />
            </>
          ) : null}

          <fieldset
            disabled={!canEdit}
            className="flex flex-col gap-5"
            onChange={() => setIsDirty(true)}
          >
            <Field
              label={messages.questionsAnswers.question}
              name="question"
              errors={form.errors.question}
            >
              <Textarea name="question" rows={4} defaultValue={questionAnswer?.Question ?? ""} />
            </Field>

            <Field
              label={messages.questionsAnswers.answer}
              name="answer"
              errors={form.errors.answer}
            >
              <Textarea name="answer" rows={4} defaultValue={questionAnswer?.Answer ?? ""} />
            </Field>

            <Field
              label={messages.questionsAnswers.category}
              name="category"
              errors={form.errors.category}
            >
              <Select name="category" defaultValue={questionAnswer?.Category ?? ""}>
                <option value="">—</option>
                <ListOptions list="question-answer.category" current={questionAnswer?.Category} />
              </Select>
            </Field>

            <Field
              label={messages.questionsAnswers.priority}
              name="priority"
              errors={form.errors.priority}
            >
              <Select name="priority" defaultValue={questionAnswer?.Priority ?? ""}>
                <option value="">—</option>
                <ListOptions list="question-answer.priority" current={questionAnswer?.Priority} />
              </Select>
            </Field>

            <Field
              label={messages.questionsAnswers.assignedTo}
              name="assignedTo"
              errors={form.errors.assignedTo}
            >
              <Input name="assignedTo" defaultValue={questionAnswer?.AssignedTo ?? ""} />
            </Field>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button type="submit" pending={pending} data-testid="qa-save">
                {messages.actions.save}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={requestClose}>
              {messages.actions.cancel}
            </Button>
            {questionAnswer && canDelete ? (
              <Button
                type="button"
                variant="danger"
                data-testid="qa-delete"
                onClick={() => setConfirmDelete(true)}
              >
                {messages.actions.delete}
              </Button>
            ) : null}
          </div>
        </form>

        {questionAnswer ? (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={messages.confirmDelete.title(
              messages.questionsAnswers.entity,
              questionAnswer.Question.length > 40
                ? questionAnswer.Question.slice(0, 37) + "…"
                : questionAnswer.Question,
            )}
            body={messages.confirmDelete.body}
            confirmLabel={messages.actions.delete}
            onConfirm={onDelete}
            pending={pending}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={showUnsaved}
        onOpenChange={setShowUnsaved}
        title={messages.feedback.unsavedChangesTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={discardAndNavigate}
        pending={false}
      />
    </>
  );
}
