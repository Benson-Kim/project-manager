"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Select, Textarea } from "@/components/ui/form/inputs";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { messages } from "@/lib/messages";
import { toDateInput } from "@/lib/format";
import { createKeyDeliverableAction, deleteKeyDeliverableAction, updateKeyDeliverableAction } from "../actions";

import {
  DELIVERABLE_PRIORITIES,
  DELIVERABLE_STATUSES,
  type KeyDeliverableRow,
} from "../schemas/key-deliverable";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";
import type { StakeholderOption } from "../repository/stakeholder-options";

/**
 * ONE deliverable form ) rendered inside the Sheet: blur + submit
 * validation against the same zod schema as the server; CONFLICT surfaces an
 * error summary with a reload affordance.
 */
export function DeliverableForm({
  projectId,
  deliverable,
  assigneeOptions,
  canEdit,
  canDelete,
  onDone,
}: {
  projectId: number;
  deliverable?: KeyDeliverableRow;
  assigneeOptions: StakeholderOption[];
  canEdit: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const schema = deliverable ? updateKeyDeliverableFormSchema : keyDeliverableFormSchema;
  const form = useZodForm(schema);

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: deliverable !== undefined,
      onSuccess: onDone,
      form,
      createAction: createKeyDeliverableAction,
      updateAction: updateKeyDeliverableAction,
      deleteAction: () =>
        deliverable
          ? deleteKeyDeliverableAction({
              keyDeliverableId: deliverable.KeyDeliverableId,
              rowVer: deliverable.RowVer,
            })
          : Promise.resolve({ ok: false as const, error: { code: "NOT_FOUND" as const, message: "" } }),
    });

  return (
    <form
      noValidate
      onBlur={canEdit ? form.onBlur : undefined}
      onSubmit={onSubmit}
      data-testid="deliverable-form"
      className="flex flex-col gap-4"
    >
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            {messages.keyDeliverables.reload}
          </Button>
        </div>
      ) : null}
      <input type="hidden" name="projectId" value={projectId} />
      {deliverable ? (
        <>
          <input type="hidden" name="keyDeliverableId" value={deliverable.KeyDeliverableId} />
          <input type="hidden" name="rowVer" value={deliverable.RowVer} />
        </>
      ) : null}

      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field
          label={messages.keyDeliverables.requirement}
          name="keyRequirement"
          errors={form.errors.keyRequirement}
        >
          <Textarea name="keyRequirement" defaultValue={deliverable?.KeyRequirement ?? ""} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={messages.keyDeliverables.deadline}
            name="deadline"
            errors={form.errors.deadline}
          >
            <DatePicker name="deadline" defaultValue={toDateInput(deliverable?.Deadline)} />
          </Field>
          <Field label={messages.keyDeliverables.assignedTo} name="assignedToStakeholderId" errors={form.errors.assignedToStakeholderId}>
            <Combobox
              name="assignedToStakeholderId"
              options={assigneeOptions.map((o) => ({
                value: String(o.stakeholderId),
                label: o.name,
              }))}
              defaultValue={
                deliverable?.AssignedToStakeholderId
                  ? String(deliverable.AssignedToStakeholderId)
                  : undefined
              }
            />
          </Field>
          <Field label={messages.keyDeliverables.status} name="status" errors={form.errors.status}>
            <Select name="status" defaultValue={deliverable?.Status ?? ""}>
              <option value="">{messages.projects.none}</option>
              {DELIVERABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={messages.keyDeliverables.priority} name="priority" errors={form.errors.priority}>
            <Select name="priority" defaultValue={deliverable?.Priority ?? ""}>
              <option value="">{messages.projects.none}</option>
              {DELIVERABLE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="deliverable-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onDone}>
            {messages.actions.cancel}
          </Button>
        </div>
        {deliverable && canDelete ? (
          <Button
            type="button"
            variant="danger"
            pending={pending}
            data-testid="deliverable-delete"
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </Button>
        ) : null}
      </div>

      {deliverable ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(
            messages.keyDeliverables.entity,
            deliverable.KeyRequirement ??
              messages.keyDeliverables.deliverableFallback(deliverable.KeyDeliverableId),
          )}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </form>
  );
}
