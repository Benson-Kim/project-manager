"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Combobox, type ComboboxOption } from "@/components/ui/form/combobox";
import { DatePicker, Input, Select, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { toDateInput } from "@/lib/format";
import { localWallClock } from "@/lib/local-time";
import { messages } from "@/lib/messages";
import {
  createTodoItemAction,
  createTodoAlertAction,
  deleteTodoAlertAction,
  deleteTodoItemAction,
  dismissTodoAlertAction,
  snoozeTodoAlertAction,
  updateTodoAlertAction,
  updateTodoItemAction,
} from "../actions";
import { PROJECT_OR_ACTIVITY, type TodoItemRow } from "../schemas/todo-item";
import { REPEAT_UNITS, type TodoAlertRow } from "../schemas/todo-alert";
import { todoItemFormSchema, updateTodoItemFormSchema } from "../schemas/todo-item-form";
import { todoAlertFormSchema, updateTodoAlertFormSchema } from "../schemas/todo-alert-form";
import type { DailyActivityOption } from "../repository/daily-activity-options";
import { ListOptions } from "@/components/ui/lookup-lists";

/**
 * To-do item detail/edit sheet: URL-synced via
 * ?id= (numeric id or "new"); closing clears the param. The optional alert
 * section (1:1 TodoAlert) is collapsed by default and submitted as a separate
 * server action after the item itself saves. Project scope travels as a hidden
 * field.
 */
export function TodoItemSheet({
  todoItem,
  todoAlert,
  isNew,
  projectId,
  dailyActivityOptions,
  canEdit,
  canDelete,
  canCreateAlert,
  canUpdateAlert,
  canDeleteAlert,
}: {
  todoItem: TodoItemRow | null;
  todoAlert: TodoAlertRow | null;
  isNew: boolean;
  projectId: number | null;
  dailyActivityOptions: DailyActivityOption[];
  canEdit: boolean;
  canDelete: boolean;
  canCreateAlert: boolean;
  canUpdateAlert: boolean;
  canDeleteAlert: boolean;
}) {
  const router = useRouter();
  const { update } = useListUrlState();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const schema = todoItem ? updateTodoItemFormSchema : todoItemFormSchema;
  const alertSchema = todoAlert ? updateTodoAlertFormSchema : todoAlertFormSchema;
  const form = useZodForm(schema);
  const alertForm = useZodForm(alertSchema);
  const [itemPending, startItemTransition] = useTransition();
  const [alertPending, startAlertTransition] = useTransition();
  const [snoozePending, startSnoozeTransition] = useTransition();
  const [itemSummary, setItemSummary] = useState<string | null>(null);
  const [alertSummary, setAlertSummary] = useState<string | null>(null);
  const [itemConflict, setItemConflict] = useState(false);
  const [alertConflict, setAlertConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAlert, setConfirmRemoveAlert] = useState(false);
  const [alertOpen, setAlertOpen] = useState(todoAlert !== null);
  const [itemDirty, setItemDirty] = useState(false);
  const [alertDirty, setAlertDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const itemDirtyRef = useRef(false);
  const alertDirtyRef = useRef(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  const { markDirty, markClean } = useUnsavedChangesGuard(itemDirty || alertDirty);

  const open = isNew || todoItem !== null;
  const canSaveAlert = todoAlert ? canUpdateAlert : canCreateAlert;
  const showAlertSection =
    todoItem !== null && (canSaveAlert || (todoAlert !== null && canDeleteAlert));
  const canSnooze =
    todoAlert !== null &&
    (todoAlert.MaxSnoozeCount === null || (todoAlert.SnoozeCount ?? 0) < todoAlert.MaxSnoozeCount);

  const resetDirty = () => {
    itemDirtyRef.current = false;
    alertDirtyRef.current = false;
    setItemDirty(false);
    setAlertDirty(false);
    markClean();
  };

  const close = () => {
    pendingNavRef.current = null;
    resetDirty();
    setShowUnsaved(false);
    update({ id: null });
  };

  const markItemFormDirty = () => {
    itemDirtyRef.current = true;
    setItemDirty(true);
    markDirty();
  };

  const markAlertFormDirty = () => {
    alertDirtyRef.current = true;
    setAlertDirty(true);
    markDirty();
  };

  const clearAlertDirty = () => {
    alertDirtyRef.current = false;
    setAlertDirty(false);
    if (!itemDirtyRef.current) markClean();
  };

  useEffect(() => {
    function handleBeforeNavigate(event: Event) {
      if (!itemDirtyRef.current && !alertDirtyRef.current) return;
      event.preventDefault();
      pendingNavRef.current = (event as CustomEvent<{ resume: () => void }>).detail.resume;
      setShowUnsaved(true);
    }

    window.addEventListener("before-navigate", handleBeforeNavigate);
    return () => window.removeEventListener("before-navigate", handleBeforeNavigate);
  }, []);

  const requestClose = () => {
    if (itemDirtyRef.current || alertDirtyRef.current) {
      pendingNavRef.current = null;
      setShowUnsaved(true);
    } else {
      close();
    }
  };

  const discardAndNavigate = () => {
    const resume = pendingNavRef.current;
    pendingNavRef.current = null;
    resetDirty();
    setShowUnsaved(false);
    if (resume) {
      resume();
    } else {
      update({ id: null });
    }
  };

  const onUnsavedOpenChange = (next: boolean) => {
    setShowUnsaved(next);
    if (!next) pendingNavRef.current = null;
  };

  const activityOptions: ComboboxOption[] = dailyActivityOptions.map((a) => ({
    value: String(a.DailyActivityId),
    label: a.Label,
  }));

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!form.validate(formElement)) {
      setItemSummary(messages.errors.VALIDATION);
      return;
    }
    setItemSummary(null);
    setItemConflict(false);
    const formData = new FormData(formElement);
    startItemTransition(async () => {
      const result = todoItem
        ? await updateTodoItemAction(formData)
        : await createTodoItemAction(formData);
      if (result.ok) {
        toast({
          variant: "success",
          title: todoItem ? messages.feedback.saved : messages.feedback.created,
        });
        announce(todoItem ? messages.feedback.saved : messages.feedback.created);
        close();
        router.refresh();
      } else {
        form.applyResult(result);
        setItemSummary(result.error.message);
        if (result.error.code === "CONFLICT") setItemConflict(true);
      }
    });
  };

  const onAlertSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!todoItem) return;
    const formElement = event.currentTarget;
    if (!alertForm.validate(formElement)) {
      setAlertSummary(messages.errors.VALIDATION);
      return;
    }
    setAlertSummary(null);
    setAlertConflict(false);
    const formData = new FormData(formElement);
    startAlertTransition(async () => {
      const result = todoAlert
        ? await updateTodoAlertAction(formData)
        : await createTodoAlertAction(formData);
      if (result.ok) {
        clearAlertDirty();
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        router.refresh();
      } else {
        alertForm.applyResult(result);
        setAlertSummary(result.error.message);
        if (result.error.code === "CONFLICT") setAlertConflict(true);
      }
    });
  };

  const onRemoveAlert = () => {
    if (!todoAlert) return;
    startAlertTransition(async () => {
      const result = await deleteTodoAlertAction({
        todoAlertId: todoAlert.TodoAlertId,
        rowVer: todoAlert.RowVer,
      });
      setConfirmRemoveAlert(false);
      if (result.ok) {
        clearAlertDirty();
        setAlertOpen(false);
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        router.refresh();
      } else {
        setAlertSummary(result.error.message);
      }
    });
  };

  const onSnooze = (minutes: number) => {
    if (!todoAlert) return;
    startSnoozeTransition(async () => {
      const result = await snoozeTodoAlertAction({
        todoAlertId: todoAlert.TodoAlertId,
        snoozeMinutes: minutes,
        rowVer: todoAlert.RowVer,
        localNow: localWallClock(),
      });
      if (result.ok) {
        toast({ variant: "success", title: messages.todoItems.snoozed });
        announce(messages.todoItems.snoozed);
        router.refresh();
      } else {
        setAlertSummary(result.error.message);
      }
    });
  };

  const onDismiss = () => {
    if (!todoAlert) return;
    startSnoozeTransition(async () => {
      const result = await dismissTodoAlertAction({
        todoAlertId: todoAlert.TodoAlertId,
        rowVer: todoAlert.RowVer,
      });
      if (result.ok) {
        toast({ variant: "success", title: messages.todoItems.dismissed });
        announce(messages.todoItems.dismissed);
        router.refresh();
      } else {
        setAlertSummary(result.error.message);
      }
    });
  };

  const onDelete = () => {
    if (!todoItem) return;
    startItemTransition(async () => {
      const result = await deleteTodoItemAction({
        todoItemId: todoItem.TodoItemId,
        rowVer: todoItem.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        close();
        router.refresh();
      } else {
        setItemSummary(result.error.message);
        if (result.error.code === "CONFLICT") setItemConflict(true);
      }
    });
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={
          todoItem ? (todoItem.TodoItem ?? messages.app.untitled) : messages.todoItems.newTodoItem
        }
      >
        {/* ΓöÇΓöÇ To-do item form ΓöÇΓöÇ */}
        <form
          noValidate
          onBlur={canEdit ? form.onBlur : undefined}
          onChange={canEdit ? markItemFormDirty : undefined}
          onSubmit={onSubmit}
          data-testid="todo-item-form"
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={itemSummary} />
          {itemConflict ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                {messages.todoItems.reload}
              </Button>
            </div>
          ) : null}
          <input type="hidden" name="projectId" value={todoItem?.ProjectId ?? projectId ?? ""} />
          {todoItem ? (
            <>
              <input type="hidden" name="todoItemId" value={todoItem.TodoItemId} />
              <input type="hidden" name="rowVer" value={todoItem.RowVer} />
            </>
          ) : null}

          <fieldset disabled={!canEdit} className="flex flex-col gap-5">
            {/* ΓöÇΓöÇ To-do section ΓöÇΓöÇ */}
            <section aria-labelledby="todo-section-heading" className="flex flex-col gap-4">
              <SectionHeading id="todo-section-heading">
                {messages.todoItems.todoSection}
              </SectionHeading>
              <Field
                label={messages.todoItems.todoItem}
                name="todoItem"
                errors={form.errors.todoItem}
              >
                <Input name="todoItem" defaultValue={todoItem?.TodoItem ?? ""} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={messages.todoItems.status} name="status">
                  <Select name="status" defaultValue={todoItem?.Status ?? ""}>
                    <option value="">{messages.todoItems.allStatuses}</option>
                    <ListOptions list="todo-item.status" current={todoItem?.Status} />
                  </Select>
                </Field>
                <Field label={messages.todoItems.priority} name="priority">
                  <Select name="priority" defaultValue={todoItem?.Priority ?? ""}>
                    <option value="">{messages.todoItems.allPriorities}</option>
                    <ListOptions list="todo-item.priority" current={todoItem?.Priority} />
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={messages.todoItems.startDate}
                  name="startDate"
                  errors={form.errors.startDate}
                >
                  <DatePicker name="startDate" defaultValue={toDateInput(todoItem?.StartDate)} />
                </Field>
                <Field
                  label={messages.todoItems.dueDate}
                  name="dueDate"
                  errors={form.errors.dueDate}
                >
                  <DatePicker name="dueDate" defaultValue={toDateInput(todoItem?.DueDate)} />
                </Field>
              </div>
              <Field label={messages.todoItems.projectOrActivity} name="projectOrActivity">
                <Select name="projectOrActivity" defaultValue={todoItem?.ProjectOrActivity ?? ""}>
                  <option value="">{messages.todoItems.allTypes}</option>
                  {PROJECT_OR_ACTIVITY.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={messages.todoItems.notes} name="notes">
                <Textarea name="notes" rows={3} defaultValue={todoItem?.Notes ?? ""} />
              </Field>
            </section>

            {/* ΓöÇΓöÇ Link section ΓöÇΓöÇ */}
            {activityOptions.length > 0 ? (
              <section aria-labelledby="todo-link-heading" className="flex flex-col gap-4">
                <SectionHeading id="todo-link-heading">
                  {messages.todoItems.linkSection}
                </SectionHeading>
                <Field label={messages.todoItems.linkedActivity} name="dailyActivityId">
                  <Combobox
                    name="dailyActivityId"
                    options={activityOptions}
                    defaultValue={
                      todoItem?.DailyActivityId ? String(todoItem.DailyActivityId) : undefined
                    }
                  />
                </Field>
              </section>
            ) : null}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {canEdit ? (
              <Button type="submit" pending={itemPending} data-testid="todo-item-save">
                {messages.actions.save}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={requestClose}>
              {messages.actions.cancel}
            </Button>
            {todoItem && canDelete ? (
              <Button
                type="button"
                variant="danger"
                data-testid="todo-item-delete"
                onClick={() => setConfirmDelete(true)}
              >
                {messages.actions.delete}
              </Button>
            ) : null}
          </div>
        </form>

        {/* ΓöÇΓöÇ Alert section (separate form, only shown when editing an existing item) ΓöÇΓöÇ */}
        {todoItem && showAlertSection ? (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="flex items-center justify-between px-4">
              <button
                type="button"
                aria-expanded={alertOpen}
                onClick={() => setAlertOpen((o) => !o)}
                className="text-sm font-semibold text-ink"
              >
                {messages.todoItems.alertSection}
              </button>
              {todoAlert && canDeleteAlert ? (
                <Button type="button" variant="danger" onClick={() => setConfirmRemoveAlert(true)}>
                  {messages.todoItems.removeAlert}
                </Button>
              ) : null}
              {!todoAlert && canCreateAlert && !alertOpen ? (
                <Button type="button" variant="secondary" onClick={() => setAlertOpen(true)}>
                  {messages.todoItems.configureAlert}
                </Button>
              ) : null}
            </div>
            {/* Snooze / dismiss row ΓÇö only shown when a saved alert exists */}
            {todoAlert && canUpdateAlert && !todoAlert.IsDismissed ? (
              <div className="flex flex-wrap items-center gap-2 px-4">
                {canSnooze
                  ? (todoAlert.SnoozeOptions ?? "5,10,15")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((mins) => (
                        <Button
                          key={mins}
                          type="button"
                          variant="secondary"
                          pending={snoozePending}
                          data-testid={`snooze-${mins}`}
                          onClick={() => onSnooze(Number(mins))}
                        >
                          {messages.todoItems.snoozeMinutes(mins)}
                        </Button>
                      ))
                  : null}
                <Button
                  type="button"
                  variant="secondary"
                  pending={snoozePending}
                  data-testid="dismiss-alert"
                  onClick={onDismiss}
                >
                  {messages.todoItems.dismiss}
                </Button>
              </div>
            ) : null}
            {alertOpen && canSaveAlert ? (
              <form
                noValidate
                onBlur={alertForm.onBlur}
                onChange={markAlertFormDirty}
                onSubmit={onAlertSubmit}
                data-testid="todo-alert-form"
                className="flex flex-col gap-4 px-4"
              >
                <ErrorSummary message={alertSummary} />
                {alertConflict ? (
                  <div>
                    <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                      {messages.todoItems.reload}
                    </Button>
                  </div>
                ) : null}
                <input type="hidden" name="todoItemId" value={todoItem.TodoItemId} />
                {todoAlert ? (
                  <>
                    <input type="hidden" name="todoAlertId" value={todoAlert.TodoAlertId} />
                    <input type="hidden" name="rowVer" value={todoAlert.RowVer} />
                  </>
                ) : null}
                <input
                  type="hidden"
                  name="isDismissed"
                  value={todoAlert?.IsDismissed ? "true" : "false"}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label={messages.todoItems.alertDay}
                    name="alertDay"
                    errors={alertForm.errors.alertDay}
                  >
                    <DatePicker name="alertDay" defaultValue={toDateInput(todoAlert?.AlertDay)} />
                  </Field>
                  <Field
                    label={messages.todoItems.alertTime}
                    name="alertTime"
                    errors={alertForm.errors.alertTime}
                  >
                    <Input
                      type="time"
                      name="alertTime"
                      defaultValue={todoAlert?.AlertTime?.slice(0, 5) ?? ""}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={messages.todoItems.repeatUnit} name="repeatUnit">
                    <Select name="repeatUnit" defaultValue={todoAlert?.RepeatUnit ?? ""}>
                      <option value=""></option>
                      {REPEAT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label={messages.todoItems.repeatInterval}
                    name="repeatInterval"
                    errors={alertForm.errors.repeatInterval}
                  >
                    <Input
                      type="number"
                      name="repeatInterval"
                      min={1}
                      max={999}
                      defaultValue={
                        todoAlert?.RepeatInterval ? String(todoAlert.RepeatInterval) : ""
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label={messages.todoItems.maxSnoozeCount}
                    name="maxSnoozeCount"
                    errors={alertForm.errors.maxSnoozeCount}
                  >
                    <Input
                      type="number"
                      name="maxSnoozeCount"
                      min={0}
                      max={99}
                      defaultValue={
                        todoAlert?.MaxSnoozeCount != null ? String(todoAlert.MaxSnoozeCount) : ""
                      }
                    />
                  </Field>
                  <Field
                    label={messages.todoItems.snoozeOptions}
                    name="snoozeOptions"
                    errors={alertForm.errors.snoozeOptions}
                  >
                    <Input
                      name="snoozeOptions"
                      placeholder="5,10,15"
                      defaultValue={todoAlert?.SnoozeOptions ?? ""}
                    />
                  </Field>
                </div>
                <div>
                  <Button type="submit" pending={alertPending} data-testid="todo-alert-save">
                    {messages.actions.save}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}

        {todoItem ? (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={messages.confirmDelete.title(
              messages.todoItems.entity,
              todoItem.TodoItem ?? messages.app.untitled,
            )}
            body={messages.confirmDelete.body}
            confirmLabel={messages.actions.delete}
            onConfirm={onDelete}
            pending={itemPending}
          />
        ) : null}
        {todoItem && todoAlert && canDeleteAlert ? (
          <ConfirmDialog
            open={confirmRemoveAlert}
            onOpenChange={setConfirmRemoveAlert}
            title={messages.todoItems.removeAlertTitle}
            body={messages.todoItems.removeAlertBody}
            confirmLabel={messages.todoItems.removeAlert}
            onConfirm={onRemoveAlert}
            pending={alertPending}
          />
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={showUnsaved}
        onOpenChange={onUnsavedOpenChange}
        title={messages.feedback.unsavedChangesTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={discardAndNavigate}
      />
    </>
  );
}
