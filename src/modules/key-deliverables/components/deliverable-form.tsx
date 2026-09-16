"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Select, Textarea } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { createKeyDeliverableAction } from "../actions/create-key-deliverable";
import { deleteKeyDeliverableAction } from "../actions/delete-key-deliverable";
import { updateKeyDeliverableAction } from "../actions/update-key-deliverable";
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

function toDateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/**
 * ONE deliverable form (ADR-0009) rendered inside the Sheet: blur + submit
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
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = deliverable ? updateKeyDeliverableFormSchema : keyDeliverableFormSchema;
  const form = useZodForm(schema);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      const result = deliverable
        ? await updateKeyDeliverableAction(formData)
        : await createKeyDeliverableAction(formData);
      if (result.ok) {
        toast({
          variant: "success",
          title: deliverable ? messages.feedback.saved : messages.feedback.created,
        });
        announce(deliverable ? messages.feedback.saved : messages.feedback.created);
        router.refresh();
        onDone();
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () => {
    if (!deliverable) return;
    startTransition(async () => {
      const result = await deleteKeyDeliverableAction({
        keyDeliverableId: deliverable.KeyDeliverableId,
        rowVer: deliverable.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        router.refresh();
        onDone();
      } else {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

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
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
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
          <Field label={messages.keyDeliverables.assignedTo} name="assignedToStakeholderId">
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
          <Field label={messages.keyDeliverables.status} name="status">
            <Select name="status" defaultValue={deliverable?.Status ?? ""}>
              <option value="">{messages.projects.none}</option>
              {DELIVERABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={messages.keyDeliverables.priority} name="priority">
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
            <Button type="submit" disabled={pending} data-testid="deliverable-save">
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
            disabled={pending}
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
