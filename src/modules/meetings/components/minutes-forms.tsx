"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { z } from "zod";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker, Input, Select, Textarea } from "@/components/ui/form/inputs";
import { useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { messages } from "@/lib/messages";
import { StakeholderSelect } from "@/modules/stakeholders/components/stakeholder-picker";
import {
  createActionItemAction,
  createAgendaItemAction,
  createDiscussionPointAction,
  createFollowUpAction,
  updateActionItemAction,
  updateAgendaItemAction,
  updateDiscussionPointAction,
  updateFollowUpAction,
} from "../actions";
import {
  ACTION_STATUSES,
  DEFAULT_ACTION_STATUS,
  ON_HOLD_REASON_MAX,
  type ActionStatus,
  type MeetingWorkspace,
  type WorkspaceActionItem,
  type WorkspaceAgendaItem,
  type WorkspaceDiscussionPoint,
  type WorkspaceFollowUp,
} from "../schemas/meeting";
import {
  MEETING_TEXT_MAX,
  createActionItemSchema,
  createAgendaItemSchema,
  createDiscussionPointSchema,
  createFollowUpSchema,
  updateActionItemSchema,
  updateAgendaItemSchema,
  updateDiscussionPointSchema,
  updateFollowUpSchema,
} from "../schemas/meeting-form";
import {
  editRowVer,
  sameAction,
  sameAgendaItem,
  sameFollowUp,
  samePoint,
} from "../schemas/minutes";
import { useMinutes, type MinutesAnswer } from "./minutes-context";

const M = messages.meetings;

/**
 * One inline minutes form: validates against the action's own schema (on
 * blur once something was typed, and on submit), reports unsaved changes to
 * the page's one guard, and hands the saved workspace back. A CONFLICT or a
 * vanished row offers Reload, which drops the draft and reads the meeting
 * again.
 */
function MinutesForm<S extends z.ZodType>({
  part,
  schema,
  label,
  testId,
  submit,
  onSaved,
  onClose,
  children,
}: {
  /** The form's name in the unsaved-changes scope; unique on the page. */
  part: string;
  schema: S;
  label: string;
  testId: string;
  submit: (data: FormData) => Promise<MinutesAnswer>;
  onSaved: (workspace: MeetingWorkspace | null) => void;
  onClose: () => void;
  children: (errors: Record<string, string[]>, changed: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const { announce } = useAnnouncer();
  const form = useZodForm(schema);
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const { markClean } = useUnsavedPart(part, dirty);
  const [summary, setSummary] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = () => setDirty(true);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([hidden])")?.focus();
  }, []);

  const close = () => {
    markClean();
    onClose();
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    if (!form.validate(element)) {
      setSummary(messages.errors.VALIDATION);
      return;
    }
    setSummary(null);
    setStale(false);
    const data = new FormData(element);
    startTransition(async () => {
      const result = await submit(data);
      if (result.ok) {
        markClean();
        announce(messages.feedback.saved);
        onSaved(result.data);
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        form.applyResult(result);
        setSummary(result.error.message);
        setStale(result.error.code === "CONFLICT" || result.error.code === "NOT_FOUND");
      }
    });
  };

  return (
    <form
      ref={ref}
      noValidate
      aria-label={label}
      data-testid={testId}
      onSubmit={onSubmit}
      onChange={changed}
      onBlur={(event) => {
        if (dirty) form.onBlur(event);
      }}
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-line bg-surface p-3"
    >
      <ErrorSummary message={summary} />
      {stale ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              close();
              router.refresh();
            }}
          >
            {M.reload}
          </Button>
        </div>
      ) : null}
      {children(form.errors, changed)}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" pending={pending} className="min-h-11" data-testid="minutes-save">
          {messages.actions.save}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" onClick={close}>
          {messages.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Adds an agenda item at the end of the agenda, or edits one's text. */
export function AgendaItemForm({
  item,
  onDone,
}: {
  item?: WorkspaceAgendaItem;
  /** Closes the form; `saved` when it saved. */
  onDone: (saved: boolean) => void;
}) {
  const { meetingId, answer } = useMinutes();
  const [started] = useState(item);
  const common = {
    label: item ? M.editItem(M.agendaEntity) : M.addAgendaItem,
    testId: "agenda-item-form",
    onSaved: (workspace: MeetingWorkspace | null) => {
      answer(workspace);
      onDone(true);
    },
    onClose: () => onDone(false),
  };
  const fields = (errors: Record<string, string[]>) => (
    <Field label={M.agendaItem} name="agendaItem" errors={errors.agendaItem}>
      <Input name="agendaItem" maxLength={MEETING_TEXT_MAX} defaultValue={item?.AgendaItem ?? ""} />
    </Field>
  );

  if (item && started) {
    return (
      <MinutesForm
        {...common}
        part={`agenda-${item.MeetingAgendaItemId}`}
        schema={updateAgendaItemSchema}
        submit={updateAgendaItemAction}
      >
        {(errors) => (
          <>
            <input type="hidden" name="meetingAgendaItemId" value={item.MeetingAgendaItemId} />
            <input type="hidden" name="rowVer" value={editRowVer(started, item, sameAgendaItem)} />
            {fields(errors)}
          </>
        )}
      </MinutesForm>
    );
  }
  return (
    <MinutesForm
      {...common}
      part="agenda-new"
      schema={createAgendaItemSchema}
      submit={createAgendaItemAction}
    >
      {(errors) => (
        <>
          <input type="hidden" name="meetingId" value={meetingId} />
          {fields(errors)}
        </>
      )}
    </MinutesForm>
  );
}

/** Adds a discussion point at the end of an agenda item's, or edits one (rich text). */
export function DiscussionPointForm({
  agendaItemId,
  point,
  onDone,
}: {
  agendaItemId: number;
  point?: WorkspaceDiscussionPoint;
  onDone: (saved: boolean) => void;
}) {
  const { answer } = useMinutes();
  const [started] = useState(point);
  const common = {
    label: point ? M.editItem(M.pointEntity) : M.addDiscussionPoint,
    testId: "discussion-point-form",
    // The formatted view is rendered on the server: refresh to bring the new one.
    onSaved: (workspace: MeetingWorkspace | null) => {
      answer(workspace, true);
      onDone(true);
    },
    onClose: () => onDone(false),
  };
  const fields = (errors: Record<string, string[]>) => (
    <Field label={M.discussionPoint} name="discussionPoint" errors={errors.discussionPoint}>
      <RichTextEditor name="discussionPoint" defaultValue={point?.DiscussionPoint} autoFocus />
    </Field>
  );

  if (point && started) {
    return (
      <MinutesForm
        {...common}
        part={`point-${point.MeetingDiscussionPointId}`}
        schema={updateDiscussionPointSchema}
        submit={updateDiscussionPointAction}
      >
        {(errors) => (
          <>
            <input
              type="hidden"
              name="meetingDiscussionPointId"
              value={point.MeetingDiscussionPointId}
            />
            <input type="hidden" name="rowVer" value={editRowVer(started, point, samePoint)} />
            {fields(errors)}
          </>
        )}
      </MinutesForm>
    );
  }
  return (
    <MinutesForm
      {...common}
      part={`point-new-${agendaItemId}`}
      schema={createDiscussionPointSchema}
      submit={createDiscussionPointAction}
    >
      {(errors) => (
        <>
          <input type="hidden" name="agendaItemId" value={agendaItemId} />
          {fields(errors)}
        </>
      )}
    </MinutesForm>
  );
}

/** The three statuses an action moves between (ADR-0043). */
export function StatusSelect({
  defaultValue,
  value,
  name = "status",
  onPick,
  ariaLabel,
}: {
  defaultValue?: ActionStatus;
  /**
   * The status the row actually has. Passing it makes the select controlled,
   * which is what a list needs: the hold asks for its reason before anything is
   * written, and a cancelled or refused pick must not leave the select showing a
   * status the row never took. A form passes `defaultValue` instead, because
   * what it shows is the draft and FormData is what reads it.
   */
  value?: ActionStatus;
  name?: string;
  onPick?: (status: ActionStatus) => void;
  ariaLabel?: string;
}) {
  return (
    <Select
      name={name}
      aria-label={ariaLabel}
      {...(value === undefined ? { defaultValue } : { value })}
      data-testid="action-status"
      onChange={onPick ? (event) => onPick(event.target.value as ActionStatus) : undefined}
    >
      {ACTION_STATUSES.map((value) => (
        <option key={value} value={value}>
          {M.actionStatus[value]}
        </option>
      ))}
    </Select>
  );
}

/**
 * The status in the action's own form, with the reason box appearing under it
 * as soon as the hold is chosen. The box stays in the form whatever the status
 * is (the schema drops a reason that no longer belongs to one), so switching
 * back and forth does not lose what was typed before the form is saved.
 */
function ActionStatusFields({
  status,
  reason,
  errors,
}: {
  status: ActionStatus;
  reason: string;
  errors: Record<string, string[]>;
}) {
  const [picked, setPicked] = useState(status);
  return (
    <>
      <Field label={M.status} name="status" errors={errors.status}>
        <StatusSelect defaultValue={status} onPick={setPicked} />
      </Field>
      <div hidden={picked !== "on-hold"}>
        <Field label={M.onHoldReason} name="onHoldReason" errors={errors.onHoldReason}>
          <Textarea
            name="onHoldReason"
            rows={2}
            maxLength={ON_HOLD_REASON_MAX}
            defaultValue={reason}
            data-testid="action-on-hold-reason"
          />
        </Field>
      </div>
    </>
  );
}

/**
 * Why an action is going on hold (ADR-0044). The reason is optional, so the
 * dialog offers both: save what was typed, or hold it without a reason. One
 * write either way — the status and its reason reach the proc together, which
 * is the pair CK_MeetingActionItem_OnHoldReason allows.
 */
export function OnHoldReasonDialog({
  open,
  actionName,
  current,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  actionName: string;
  /** The reason it already carries, when the hold is being changed rather than started. */
  current: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState(current ?? "");
  // Each action opens the dialog with its own reason; the key resets this state.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={M.onHoldReasonTitle}
      description={M.onHoldReasonBody}
    >
      <div className="flex flex-col gap-3">
        <Field label={M.onHoldReasonOf(actionName)} name="onHoldReason">
          <Textarea
            name="onHoldReason"
            rows={3}
            maxLength={ON_HOLD_REASON_MAX}
            autoFocus
            data-testid="on-hold-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <p className="text-xs text-ink-muted">{M.onHoldReasonHint}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {messages.actions.cancel}
          </Button>
          <Button
            variant="secondary"
            data-testid="hold-without-reason"
            onClick={() => onConfirm(null)}
            disabled={pending}
          >
            {M.putOnHold}
          </Button>
          <Button
            data-testid="hold-with-reason"
            onClick={() => onConfirm(reason.trim() || null)}
            pending={pending}
          >
            {M.saveReason}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Adds an action under a discussion point (or directly under an agenda
 * item), or edits one: the action, the person responsible (a stakeholder of
 * the project, checklist row 13), the due date, the status and, for a hold,
 * its reason.
 */
export function ActionItemForm({
  parent,
  action,
  onDone,
}: {
  /** Where a new action goes: under the discussion point, else directly under the agenda item. */
  parent?: { agendaItemId: number; discussionPointId: number | null };
  action?: WorkspaceActionItem;
  onDone: (saved: boolean) => void;
}) {
  const { answer, people } = useMinutes();
  const [started] = useState(action);
  const common = {
    label: action ? M.editItem(M.actionEntity) : M.addAction,
    testId: "action-item-form",
    onSaved: (workspace: MeetingWorkspace | null) => {
      answer(workspace);
      onDone(true);
    },
    onClose: () => onDone(false),
  };
  const fields = (errors: Record<string, string[]>, changed: () => void) => (
    <>
      <Field label={M.action} name="action" errors={errors.action}>
        <Input name="action" maxLength={MEETING_TEXT_MAX} defaultValue={action?.Action ?? ""} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={M.personResponsible}
          name="assignedToStakeholderId"
          errors={errors.assignedToStakeholderId}
        >
          {/*
            Pick a stakeholder, or type the name of someone who is not one — a
            guest, or somebody outside the organisation (client feedback
            2026-10-26). A stored name with no stakeholder behind it is free
            text, so it comes back into the box as text.
          */}
          <StakeholderSelect
            name="assignedToStakeholderId"
            options={people(
              action && action.AssignedToStakeholderId !== null
                ? { id: action.AssignedToStakeholderId, name: action.AssigneeName }
                : undefined,
            )}
            defaultValue={action?.AssignedToStakeholderId ?? null}
            freeTextName="assigneeOther"
            defaultFreeText={
              action && action.AssignedToStakeholderId === null
                ? (action.AssigneeName ?? "")
                : undefined
            }
            onSelect={changed}
          />
        </Field>
        <Field label={M.dueDate} name="dueDate" errors={errors.dueDate}>
          <DatePicker name="dueDate" defaultValue={action?.DueDate ?? ""} />
        </Field>
      </div>
      <ActionStatusFields
        status={action?.Status ?? DEFAULT_ACTION_STATUS}
        reason={action?.OnHoldReason ?? ""}
        errors={errors}
      />
    </>
  );

  if (action && started) {
    return (
      <MinutesForm
        {...common}
        part={`action-${action.MeetingActionItemId}`}
        schema={updateActionItemSchema}
        submit={updateActionItemAction}
      >
        {(errors, changed) => (
          <>
            <input type="hidden" name="meetingActionItemId" value={action.MeetingActionItemId} />
            <input type="hidden" name="rowVer" value={editRowVer(started, action, sameAction)} />
            {fields(errors, changed)}
          </>
        )}
      </MinutesForm>
    );
  }
  if (!parent) return null;
  const { agendaItemId, discussionPointId } = parent;
  return (
    <MinutesForm
      {...common}
      part={`action-new-${discussionPointId == null ? `a${agendaItemId}` : `p${discussionPointId}`}`}
      schema={createActionItemSchema}
      submit={createActionItemAction}
    >
      {(errors, changed) => (
        <>
          {discussionPointId == null ? (
            <input type="hidden" name="agendaItemId" value={agendaItemId} />
          ) : (
            <input type="hidden" name="discussionPointId" value={discussionPointId} />
          )}
          {fields(errors, changed)}
        </>
      )}
    </MinutesForm>
  );
}

/**
 * Adds a follow-up under an action item, or edits one (ADR-0043): what was
 * followed up, the person it is assigned to, the date it was made and the date
 * it is due. The status stays on the action, so a reader looks in one place.
 */
export function FollowUpForm({
  meetingActionItemId,
  followUp,
  onDone,
}: {
  meetingActionItemId: number;
  followUp?: WorkspaceFollowUp;
  onDone: (saved: boolean) => void;
}) {
  const { answer, people } = useMinutes();
  const [started] = useState(followUp);
  const common = {
    label: followUp ? M.editItem(M.followUpEntity) : M.addFollowUp,
    testId: "follow-up-form",
    onSaved: (workspace: MeetingWorkspace | null) => {
      answer(workspace);
      onDone(true);
    },
    onClose: () => onDone(false),
  };
  const fields = (errors: Record<string, string[]>, changed: () => void) => (
    <>
      <Field label={M.followUp} name="followUp" errors={errors.followUp}>
        <Input
          name="followUp"
          maxLength={MEETING_TEXT_MAX}
          defaultValue={followUp?.FollowUp ?? ""}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field
          label={M.assignedTo}
          name="assignedToStakeholderId"
          errors={errors.assignedToStakeholderId}
        >
          <StakeholderSelect
            name="assignedToStakeholderId"
            options={people(
              followUp
                ? { id: followUp.AssignedToStakeholderId, name: followUp.AssigneeName }
                : undefined,
            )}
            defaultValue={followUp?.AssignedToStakeholderId ?? null}
            onSelect={changed}
          />
        </Field>
        <Field label={M.followUpDate} name="followUpDate" errors={errors.followUpDate}>
          <DatePicker name="followUpDate" defaultValue={followUp?.FollowUpDate ?? ""} />
        </Field>
        <Field label={M.dueDate} name="dueDate" errors={errors.dueDate}>
          <DatePicker name="dueDate" defaultValue={followUp?.DueDate ?? ""} />
        </Field>
      </div>
    </>
  );

  if (followUp && started) {
    return (
      <MinutesForm
        {...common}
        part={`follow-up-${followUp.MeetingActionFollowUpId}`}
        schema={updateFollowUpSchema}
        submit={updateFollowUpAction}
      >
        {(errors, changed) => (
          <>
            <input
              type="hidden"
              name="meetingActionFollowUpId"
              value={followUp.MeetingActionFollowUpId}
            />
            <input
              type="hidden"
              name="rowVer"
              value={editRowVer(started, followUp, sameFollowUp)}
            />
            {fields(errors, changed)}
          </>
        )}
      </MinutesForm>
    );
  }
  return (
    <MinutesForm
      {...common}
      part={`follow-up-new-${meetingActionItemId}`}
      schema={createFollowUpSchema}
      submit={createFollowUpAction}
    >
      {(errors, changed) => (
        <>
          <input type="hidden" name="meetingActionItemId" value={meetingActionItemId} />
          {fields(errors, changed)}
        </>
      )}
    </MinutesForm>
  );
}
