"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { StoredDates } from "@/components/ui/form/stored-dates";
import { DatePicker, Select, Textarea } from "@/components/ui/form/inputs";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { ListOptions } from "@/components/ui/lookup-lists";
import { messages } from "@/lib/messages";
import { toDateInput } from "@/lib/format";
import {
  createKeyDeliverableAction,
  deleteKeyDeliverableAction,
  updateKeyDeliverableAction,
} from "../actions";

import type { KeyDeliverableRow } from "../schemas/key-deliverable";
import {
  keyDeliverableFormSchema,
  updateKeyDeliverableFormSchema,
} from "../schemas/key-deliverable-form";
import { StakeholderMultiSelect } from "@/modules/stakeholders/components/stakeholder-picker";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import { todayUtc } from "../schemas/wbs";

/**
 * ONE deliverable form rendered inside the Sheet: blur + submit
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
  /** A parent's dates come from its sub-items (ADR-0027); the form shows them, read-only. */
  const rolledUp = deliverable?.HasChildren === true;
  const subItems = deliverable?.SubItemCount ?? 0;
  const deliverableName = deliverable
    ? (deliverable.KeyRequirement ??
      messages.keyDeliverables.deliverableFallback(deliverable.KeyDeliverableId))
    : "";
  const [defaultStart] = useState(todayUtc);

  // Multi-assignee state — initialised from the row's Assignees array.
  const [selectedAssignees, setSelectedAssignees] = useState<{ id: number; name: string }[]>(
    () => deliverable?.Assignees ?? [],
  );

  const handleAdd = useCallback((opt: StakeholderOption) => {
    setSelectedAssignees((prev) => {
      if (prev.some((a) => a.id === opt.stakeholderId)) return prev;
      return [...prev, { id: opt.stakeholderId, name: opt.name }];
    });
  }, []);

  const handleRemove = useCallback((id: number) => {
    setSelectedAssignees((prev) => prev.filter((a) => a.id !== id));
  }, []);

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
          : Promise.resolve({
              ok: false as const,
              error: { code: "NOT_FOUND" as const, message: "" },
            }),
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
          <StoredDates
            dates={{
              requestedDate: deliverable.RequestedDate,
              startDate: deliverable.StartDate,
              deadline: deliverable.Deadline,
            }}
          />
        </>
      ) : null}

      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field
          label={messages.keyDeliverables.deliverable}
          name="keyRequirement"
          errors={form.errors.keyRequirement}
        >
          <Textarea name="keyRequirement" defaultValue={deliverable?.KeyRequirement ?? ""} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={
              rolledUp
                ? messages.keyDeliverables.rolledUp(messages.keyDeliverables.startDate)
                : messages.keyDeliverables.startDate
            }
            name="startDate"
            errors={form.errors.startDate}
          >
            <DatePicker
              name="startDate"
              readOnly={rolledUp}
              defaultValue={toDateInput(deliverable ? deliverable.StartDate : defaultStart)}
            />
          </Field>
          <Field
            label={
              rolledUp
                ? messages.keyDeliverables.rolledUp(messages.keyDeliverables.deadline)
                : messages.keyDeliverables.deadline
            }
            name="deadline"
            errors={form.errors.deadline}
          >
            <DatePicker
              name="deadline"
              readOnly={rolledUp}
              defaultValue={toDateInput(deliverable?.Deadline)}
            />
          </Field>
          <Field
            label={messages.keyDeliverables.requestedDate}
            name="requestedDate"
            errors={form.errors.requestedDate}
          >
            <DatePicker
              name="requestedDate"
              defaultValue={toDateInput(deliverable?.RequestedDate)}
            />
          </Field>
          <Field label={messages.keyDeliverables.status} name="status" errors={form.errors.status}>
            <Select name="status" defaultValue={deliverable?.Status ?? ""}>
              <option value="">{messages.projects.none}</option>
              <ListOptions list="key-deliverable.status" current={deliverable?.Status} />
            </Select>
          </Field>
          <Field
            label={messages.keyDeliverables.priority}
            name="priority"
            errors={form.errors.priority}
          >
            <Select name="priority" defaultValue={deliverable?.Priority ?? ""}>
              <option value="">{messages.projects.none}</option>
              <ListOptions list="key-deliverable.priority" current={deliverable?.Priority} />
            </Select>
          </Field>
        </div>

        <Field label={messages.keyDeliverables.assignees} name="assigneeIds[]">
          <StakeholderMultiSelect
            options={assigneeOptions}
            selected={selectedAssignees}
            disabled={!canEdit}
            inputName="assigneeIds[]"
            removeLabel={messages.keyDeliverables.removeAssignee}
            emptyPlaceholder={messages.keyDeliverables.unassigned}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </Field>
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
          title={
            subItems > 0
              ? messages.keyDeliverables.wbs.deleteTitle(deliverableName, subItems)
              : messages.confirmDelete.title(messages.keyDeliverables.entity, deliverableName)
          }
          body={
            subItems > 0 ? messages.keyDeliverables.wbs.deleteBody : messages.confirmDelete.body
          }
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </form>
  );
}
