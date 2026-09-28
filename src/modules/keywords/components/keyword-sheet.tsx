"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Textarea } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";

import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { type KeywordRow } from "../schemas/keyword";
import { keywordFormSchema, updateKeywordFormSchema } from "../schemas/keyword-form";
import { createKeywordAction, deleteKeywordAction, updateKeywordAction } from "../actions";

/**
 * Keyword detail/edit sheet  default pattern): URL-synced via ?id=
 * (numeric id or "new"); closing clears the param. Project scope travels as a
 * hidden field .
 */
export function KeywordSheet({
  keyword,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  keyword: KeywordRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = keyword ? updateKeywordFormSchema : keywordFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  useUnsavedChangesGuard(isDirty);

  const close = () => { setIsDirty(false); setShowUnsaved(false); update({ id: null }); };

  const requestClose = () => {
    if (isDirty) { setShowUnsaved(true); } else { close(); }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!form.validate(formEl)) { setSummary(messages.errors.summaryTitle); return; }
    setSummary(null);
    setConflict(false);
    const data = new FormData(formEl);
    startTransition(async () => {
      const result = keyword
        ? await updateKeywordAction(data)
        : await createKeywordAction(data);
      if (result.ok) {
        toast({ variant: "success", title: keyword ? messages.feedback.saved : messages.feedback.created });
        announce(keyword ? messages.feedback.saved : messages.feedback.created);
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
    if (!keyword) return;
    startTransition(async () => {
      const result = await deleteKeywordAction({ keywordId: keyword.KeywordId, rowVer: keyword.RowVer });
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

  const open = isNew || keyword !== null;

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      title={keyword ? keyword.Keyword : messages.keywords.newKeyword}
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="keyword-form"
        className="flex flex-col gap-5"
      >
        <ErrorSummary message={summary} />
        {conflict ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              {messages.keywords.reload}
            </Button>
          </div>
        ) : null}
        <input type="hidden" name="projectId" value={keyword?.ProjectId ?? projectId} />
        {keyword ? (
          <>
            <input type="hidden" name="keywordId" value={keyword.KeywordId} />
            <input type="hidden" name="rowVer" value={keyword.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5" onChange={() => setIsDirty(true)}>
          <Field
            label={messages.keywords.keyword}
            name="keyword"
            errors={form.errors.keyword}
          >
            <Input name="keyword" defaultValue={keyword?.Keyword ?? ""} />
          </Field>
          <Field
            label={messages.keywords.definition}
            name="definition"
            errors={form.errors.definition}
          >
            <Textarea name="definition" rows={3} defaultValue={keyword?.Definition ?? ""} />
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="keyword-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={requestClose}>
            {messages.actions.cancel}
          </Button>
          {keyword && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="keyword-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {keyword ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(messages.keywords.entity, keyword.Keyword)}
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
      onConfirm={close}
      pending={false}
    />
    </>
  );
}
