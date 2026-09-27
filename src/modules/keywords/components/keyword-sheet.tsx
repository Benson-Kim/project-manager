"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Input, Textarea } from "@/components/ui/form/inputs";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
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
  const { update } = useListUrlState();
  const schema = keyword ? updateKeywordFormSchema : keywordFormSchema;
  const form = useZodForm(schema);

  const close = () => update({ id: null });

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: keyword !== null,
      onSuccess: close,
      form,
      createAction: createKeywordAction,
      updateAction: updateKeywordAction,
      deleteAction: ({ keywordId, rowVer }: { keywordId: number; rowVer: number }) =>
        deleteKeywordAction({ keywordId, rowVer }),
    });

  const open = isNew || keyword !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
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

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <Field
            label={messages.keywords.keyword}
            name="keyword"
            errors={form.errors.keyword}
          >
            <Input name="keyword" defaultValue={keyword?.Keyword ?? ""} />
          </Field>
          <Field label={messages.keywords.definition} name="definition">
            <Textarea name="definition" rows={3} defaultValue={keyword?.Definition ?? ""} />
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="keyword-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
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
          onConfirm={() => onDelete({ keywordId: keyword.KeywordId, rowVer: keyword.RowVer })}
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
