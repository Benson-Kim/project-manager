"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select, Textarea } from "@/components/ui/form/inputs";
import { SectionHeading } from "@/components/ui/form/section-heading";
import { useSheetFormActions } from "@/components/ui/form/use-sheet-form-actions";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { ListOptions } from "@/components/ui/lookup-lists";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { useToast } from "@/components/ui/toast";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  createDailyActivityAction,
  deleteDailyActivityAction,
  updateDailyActivityAction,
} from "../actions";
import type { DailyActivityRow } from "../schemas/daily-activity";
import {
  dailyActivityFormSchema,
  updateDailyActivityFormSchema,
} from "../schemas/daily-activity-form";
import { buildTodoFromDailyActivityAction } from "@/modules/todo-items/actions";

/**
 * Daily Activity detail/edit sheet  default pattern): edit is the
 * default content, URL-synced via ?id= (numeric id or "new"); closing clears
 * the param. Project scope travels as a hidden field .
 */
export function DailyActivitySheet({
  activity,
  isNew,
  projectId,
  canEdit,
  canDelete,
  canCreateTodo,
}: {
  activity: DailyActivityRow | null;
  isNew: boolean;
  projectId: number | null;
  canEdit: boolean;
  canDelete: boolean;
  canCreateTodo?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { update } = useListUrlState();
  const schema = activity ? updateDailyActivityFormSchema : dailyActivityFormSchema;
  const form = useZodForm(schema);
  const [buildPending, startBuildTransition] = useTransition();
  const [buildSummary, setBuildSummary] = useState<string | null>(null);

  const close = () => update({ id: null });

  const { pending, summary, conflict, confirmDelete, setConfirmDelete, onSubmit, onDelete } =
    useSheetFormActions({
      isEdit: activity !== null,
      onSuccess: close,
      form,
      createAction: createDailyActivityAction,
      updateAction: updateDailyActivityAction,
      deleteAction: (_args: void) =>
        deleteDailyActivityAction({
          dailyActivityId: activity!.DailyActivityId,
          rowVer: activity!.RowVer,
        }),
    });

  const onBuildTodo = () => {
    if (!activity) return;
    startBuildTransition(async () => {
      const result = await buildTodoFromDailyActivityAction({
        dailyActivityId: activity.DailyActivityId,
      });
      if (result.ok) {
        toast({ variant: "success", title: messages.dailyActivities.todoCreated });
        router.refresh();
      } else {
        setBuildSummary(result.error.message);
      }
    });
  };

  const open = isNew || activity !== null;
  const title = activity
    ? (activity.Task ?? activity.MyActivity ?? messages.app.untitled)
    : messages.dailyActivities.newActivity;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={title}
    >
      <form
        noValidate
        onBlur={canEdit ? form.onBlur : undefined}
        onSubmit={onSubmit}
        data-testid="daily-activity-form"
        className="flex flex-col gap-5"
      >
        <ErrorSummary message={summary} />
        {conflict ? (
          <div>
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              {messages.dailyActivities.reload}
            </Button>
          </div>
        ) : null}
        <input type="hidden" name="projectId" value={activity?.ProjectId ?? projectId ?? 0} />
        {activity ? (
          <>
            <input type="hidden" name="dailyActivityId" value={activity.DailyActivityId} />
            <input type="hidden" name="rowVer" value={activity.RowVer} />
          </>
        ) : null}

        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          {/* ── Activity section ── */}
          <section aria-labelledby="activity-section-heading" className="flex flex-col gap-4">
            <SectionHeading id="activity-section-heading">
              {messages.dailyActivities.activitySection}
            </SectionHeading>
            <Field label={messages.dailyActivities.task} name="task" errors={form.errors.task}>
              <Textarea name="task" rows={3} defaultValue={activity?.Task ?? ""} />
            </Field>
            <Field
              label={messages.dailyActivities.myActivity}
              name="myActivity"
              errors={form.errors.myActivity}
            >
              <Textarea name="myActivity" rows={3} defaultValue={activity?.MyActivity ?? ""} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label={messages.dailyActivities.activityDate}
                name="activityDate"
                errors={form.errors.activityDate}
              >
                <DatePicker
                  name="activityDate"
                  defaultValue={toDateInput(activity?.ActivityDate)}
                />
              </Field>
              <Field
                label={messages.dailyActivities.requestDate}
                name="requestDate"
                errors={form.errors.requestDate}
              >
                <DatePicker name="requestDate" defaultValue={toDateInput(activity?.RequestDate)} />
              </Field>
              <Field
                label={messages.dailyActivities.completeDate}
                name="completeDate"
                errors={form.errors.completeDate}
              >
                <DatePicker
                  name="completeDate"
                  defaultValue={toDateInput(activity?.CompleteDate)}
                />
              </Field>
            </div>
            <Field
              label={messages.dailyActivities.activityStatus}
              name="activityStatusId"
              errors={form.errors.activityStatusId}
            >
              <Select
                name="activityStatusId"
                defaultValue={activity?.ActivityStatusId ? String(activity.ActivityStatusId) : ""}
              >
                <option value="">{messages.dailyActivities.noStatus}</option>
                <ListOptions
                  list="daily-activity.status"
                  current={activity?.ActivityStatusId}
                  currentLabel={activity?.ActivityStatus}
                />
              </Select>
            </Field>
          </section>

          {/* ── Details section ── */}
          <section aria-labelledby="activity-details-heading" className="flex flex-col gap-4">
            <SectionHeading id="activity-details-heading">
              {messages.dailyActivities.detailsSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.dailyActivities.requester}
                name="requester"
                errors={form.errors.requester}
              >
                <Input name="requester" defaultValue={activity?.Requester ?? ""} />
              </Field>
              <Field
                label={messages.dailyActivities.assignedTo}
                name="assignedTo"
                errors={form.errors.assignedTo}
              >
                <Input name="assignedTo" defaultValue={activity?.AssignedTo ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.dailyActivities.contactMethod}
                name="contactMethod"
                errors={form.errors.contactMethod}
              >
                <Select name="contactMethod" defaultValue={activity?.ContactMethod ?? ""}>
                  <option value="">{messages.dailyActivities.noStatus}</option>
                  <ListOptions
                    list="daily-activity.contact-method"
                    current={activity?.ContactMethod}
                  />
                </Select>
              </Field>
              <Field
                label={messages.dailyActivities.taskType}
                name="taskType"
                errors={form.errors.taskType}
              >
                <Select name="taskType" defaultValue={activity?.TaskType ?? ""}>
                  <option value="">{messages.dailyActivities.allTaskTypes}</option>
                  <ListOptions list="daily-activity.task-type" current={activity?.TaskType} />
                </Select>
              </Field>
            </div>
          </section>

          {/* ── Metrics section ── */}
          <section aria-labelledby="activity-metrics-heading" className="flex flex-col gap-4">
            <SectionHeading id="activity-metrics-heading">
              {messages.dailyActivities.metricsSection}
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={messages.dailyActivities.timeSpent}
                name="timeSpent"
                errors={form.errors.timeSpent}
              >
                <Input
                  type="number"
                  name="timeSpent"
                  min={0}
                  max={9999}
                  aria-label={`${messages.dailyActivities.timeSpent} (${messages.dailyActivities.timeSpentSuffix})`}
                  defaultValue={
                    activity?.TimeSpent !== null ? String(activity?.TimeSpent ?? "") : ""
                  }
                />
              </Field>
              <Field
                label={messages.dailyActivities.progress}
                name="progress"
                errors={form.errors.progress}
              >
                <Input
                  type="number"
                  name="progress"
                  min={0}
                  max={100}
                  aria-label={`${messages.dailyActivities.progress} (${messages.dailyActivities.progressSuffix})`}
                  defaultValue={activity?.Progress !== null ? String(activity?.Progress ?? "") : ""}
                />
              </Field>
            </div>
            <Field
              label={messages.dailyActivities.comments}
              name="comments"
              errors={form.errors.comments}
            >
              <Textarea name="comments" rows={3} defaultValue={activity?.Comments ?? ""} />
            </Field>
          </section>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {canEdit ? (
            <Button type="submit" pending={pending} data-testid="daily-activity-save">
              {messages.actions.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            {messages.actions.cancel}
          </Button>
          {activity && canDelete ? (
            <Button
              type="button"
              variant="danger"
              data-testid="daily-activity-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {messages.actions.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {/* ── Build to-do section (req 13.1) — shown when viewing an existing activity and canCreateTodo ── */}
      {activity && canCreateTodo ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4 px-4">
          {buildSummary ? (
            <p className="text-sm text-red-600" role="alert">
              {buildSummary}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            pending={buildPending}
            data-testid="build-todo-from-activity"
            onClick={onBuildTodo}
          >
            {messages.dailyActivities.buildTodo}
          </Button>
        </div>
      ) : null}

      {activity ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(
            messages.dailyActivities.entity,
            activity.Task ?? activity.MyActivity ?? messages.app.untitled,
          )}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={onDelete}
          pending={pending}
        />
      ) : null}
    </Sheet>
  );
}
