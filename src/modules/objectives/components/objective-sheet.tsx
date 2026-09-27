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
import type { ObjectiveRow } from "../schemas/objective";
import { objectiveFormSchema, updateObjectiveFormSchema } from "../schemas/objective-form";
import {
  createObjectiveAction,
  deleteObjectiveAction,
  updateObjectiveAction,
} from "../actions";

/**
 * Objective detail/edit sheet (default pattern): URL-synced via ?id=
 * (numeric id or "new"); closing clears the param. Project scope travels
 * as a hidden field.
 */
export function ObjectiveSheet({
  objective,
  isNew,
  projectId,
  canEdit,
  canDelete,
}: {
  objective: ObjectiveRow | null;
  isNew: boolean;
  projectId: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { update } = useListUrlState();
  const schema = objective ? updateObjectiveFormSchema : objectiveFormSchema;
  const form = useZodForm(schema);

  const close = () => update({ id: null });

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: objective !== null,
      onSuccess: close,
      form,
      createAction: createObjectiveAction,
      updateAction: updateObjectiveAction,
      deleteAction: ({ objectiveId, rowVer }: { objectiveId: number; rowVer: number }) =>
        deleteObjectiveAction({ objectiveId, rowVer }),
    });

  const open = isNew || objective !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        objective
          ? (objective.ObjectiveText ?? messages.app.untitled)
          : messages.objectives.newObjective
      }
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="objective-form"
        className="flex flex-col gap-5"
      >
        <ErrorSummary message={summary} />
        {conflict ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              {messages.objectives.reload}
            </Button>
          </div>
        ) : null}
        <input type="hidden" name="projectId" value={objective?.ProjectId ?? projectId} />
        {objective ? (
          <>
            <input type="hidden" name="objectiveId" value={objective.ObjectiveId} />
            <input type="hidden" name="rowVer" value={objective.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <Field
            label={messages.objectives.objectiveText}
            name="objectiveText"
            errors={form.errors.objectiveText}
          >
            <Textarea
              name="objectiveText"
              rows={4}
              defaultValue={objective?.ObjectiveText ?? ""}
            />
          </Field>
          <Field label={messages.objectives.qMeasurable} name="qMeasurable">
            <Input name="qMeasurable" defaultValue={objective?.QMeasurable ?? ""} />
          </Field>
          <Field label={messages.objectives.qSuccess} name="qSuccess">
            <Textarea name="qSuccess" rows={3} defaultValue={objective?.QSuccess ?? ""} />
          </Field>
          <Field label={messages.objectives.qAlignmentStrategy} name="qAlignmentStrategy">
            <Input
              name="qAlignmentStrategy"
              defaultValue={objective?.QAlignmentStrategy ?? ""}
            />
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="objective-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            {messages.actions.cancel}
          </Button>
          {objective && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="objective-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {objective ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(
            messages.objectives.entity,
            objective.ObjectiveText ?? messages.app.untitled,
          )}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={() =>
            onDelete({ objectiveId: objective.ObjectiveId, rowVer: objective.RowVer })
          }
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
