"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input } from "@/components/ui/form/inputs";
import { useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { deleteMeetingAction, updateMeetingAction } from "../actions";
import type { MeetingRow } from "../schemas/meeting";
import { meetingFormValues, updateMeetingFormSchema } from "../schemas/meeting-form";

const M = messages.meetings;

/** A title for a dialog, cut so it fits. */
function shortTitle(subject: string | null): string {
  const title = subject ?? messages.app.untitled;
  return title.length > 40 ? `${title.slice(0, 37)}…` : title;
}

/**
 * The meeting header (checklist rows 54, 72) on the workspace page: one form,
 * blur and submit validation against the same schema as the action, CONFLICT
 * with a reload, delete behind a confirmation, and unsaved changes guarding
 * the way out through the page's UnsavedChangesScope, which it shares with the
 * participant panel. The page remounts it (key = RowVer) when the meeting
 * changes.
 */
export function MeetingHeaderForm({
  meeting,
  listHref,
  canEdit,
  canDelete,
}: {
  meeting: MeetingRow;
  listHref: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const form = useZodForm(updateMeetingFormSchema);
  const values = meetingFormValues(meeting);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { leave, markClean, forgetAll } = useUnsavedPart("meeting-header", isDirty);
  const clean = () => {
    markClean();
    setIsDirty(false);
  };

  const expired = (code: string) => {
    if (code !== "UNAUTHENTICATED") return false;
    router.push("/login?reason=expired");
    return true;
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!form.validate(formElement)) {
      setSummary(messages.errors.summaryTitle);
      return;
    }
    setSummary(null);
    setConflict(false);
    const data = new FormData(formElement);
    startTransition(async () => {
      const result = await updateMeetingAction(data);
      if (result.ok) {
        clean();
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        router.refresh();
      } else if (!expired(result.error.code)) {
        form.applyResult(result);
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const onDelete = () =>
    startTransition(async () => {
      const result = await deleteMeetingAction({
        meetingId: meeting.MeetingId,
        rowVer: meeting.RowVer,
      });
      setConfirmDelete(false);
      if (result.ok) {
        forgetAll();
        setIsDirty(false);
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        router.push(listHref);
      } else if (!expired(result.error.code)) {
        setSummary(result.error.message);
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });

  const back = () => leave(() => router.push(listHref));

  const errors = form.errors;

  return (
    <form
      noValidate
      onBlur={canEdit ? form.onBlur : undefined}
      onSubmit={onSubmit}
      onChange={canEdit ? () => setIsDirty(true) : undefined}
      data-testid="meeting-header-form"
      aria-labelledby="meeting-details-heading"
      className="flex flex-col gap-5"
    >
      <h2 id="meeting-details-heading" className="text-base font-medium text-ink">
        {M.details}
      </h2>
      <ErrorSummary message={summary} />
      {conflict ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            {M.reload}
          </Button>
        </div>
      ) : null}
      <input type="hidden" name="meetingId" value={values.meetingId} />
      <input type="hidden" name="rowVer" value={values.rowVer} />

      {!canEdit ? (
        <p id="meeting-read-only" className="sr-only">
          {messages.app.readOnly}
        </p>
      ) : null}
      <fieldset
        disabled={!canEdit}
        aria-describedby={canEdit ? undefined : "meeting-read-only"}
        className="flex flex-col gap-5"
      >
        <Field label={M.subject} name="subject" errors={errors.subject}>
          <Input name="subject" maxLength={255} defaultValue={values.subject} />
        </Field>
        <Field label={M.objective} name="objective" errors={errors.objective}>
          <RichTextEditor name="objective" defaultValue={values.objective as string} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={M.startDate} name="startDate" errors={errors.startDate}>
            <DatePicker name="startDate" defaultValue={values.startDate} />
          </Field>
          <Field label={M.startTime} name="startTime" errors={errors.startTime}>
            <Input name="startTime" type="time" defaultValue={values.startTime} />
          </Field>
          <Field label={M.endTime} name="endTime" errors={errors.endTime}>
            <Input name="endTime" type="time" defaultValue={values.endTime} />
          </Field>
          <Field label={M.dateReceived} name="dateReceived" errors={errors.dateReceived}>
            <DatePicker name="dateReceived" defaultValue={values.dateReceived} />
          </Field>
        </div>
        <Field label={M.description} name="description" errors={errors.description}>
          <RichTextEditor name="description" defaultValue={values.description as string} />
        </Field>
        <Field label={M.conclusion} name="conclusion" errors={errors.conclusion}>
          <RichTextEditor name="conclusion" defaultValue={values.conclusion as string} />
        </Field>
        <Field label={M.followupAction} name="followupAction" errors={errors.followupAction}>
          <Input name="followupAction" maxLength={255} defaultValue={values.followupAction} />
        </Field>
        {/*
          Location is the form's last field so the participant panel, which the
          page renders directly below, sits under it (client feedback
          2026-10-23). The panel keeps its own <form> and its own stamped save,
          so it cannot be nested inside this one.
        */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={M.location} name="location" errors={errors.location}>
            <Input name="location" maxLength={255} defaultValue={values.location} />
          </Field>
          <Field label={M.nextMeeting} name="nextMeeting" errors={errors.nextMeeting}>
            <DatePicker name="nextMeeting" defaultValue={values.nextMeeting} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button type="submit" pending={pending} data-testid="meeting-save">
            {messages.actions.save}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={back}>
          {messages.actions.cancel}
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="danger"
            data-testid="meeting-delete"
            onClick={() => setConfirmDelete(true)}
          >
            {messages.actions.delete}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={messages.confirmDelete.title(M.entity, shortTitle(meeting.Subject))}
        body={messages.confirmDelete.body}
        confirmLabel={messages.actions.delete}
        onConfirm={onDelete}
        pending={pending}
      />
    </form>
  );
}
