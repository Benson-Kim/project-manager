"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FormValues } from "@/components/ui/data-view/datasheet";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input } from "@/components/ui/form/inputs";
import { useUnsavedPart } from "@/components/ui/form/unsaved-scope";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { formEditStep, recordKey, stepName } from "@/lib/undo/steps";
import { usePageHistory } from "@/components/undo/page-history";
import { PANEL_BODY, PANEL_SHELL } from "@/components/ui/panel-styles";
import { deleteMeetingAction, updateMeetingAction } from "../actions";
import type { MeetingFormat, MeetingRow } from "../schemas/meeting";
import {
  meetingFormKey,
  meetingFormValues,
  updateMeetingFormSchema,
} from "../schemas/meeting-form";
import { notifySaved } from "@/lib/cross-window";

const M = messages.meetings;

type Errors = Partial<Record<string, string[]>>;
type Part = "details" | "notes";

const FIELD_LABELS: Record<string, string> = {
  subject: M.subject,
  startDate: M.startDate,
  startTime: M.startTime,
  endTime: M.endTime,
  location: M.location,
  nextMeeting: M.nextMeeting,
  meetingFormat: M.meetingFormat,
  meetingLink: M.meetingLink,
  nextMeetingLink: M.nextMeetingLink,
  objective: M.objective,
  description: M.description,
  conclusion: M.conclusion,
  dateReceived: M.dateReceived,
};

function computeDuration(startTime?: string | null, endTime?: string | null): string {
  if (!startTime || !endTime) return "—";
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return "—";
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m <= 0) return "—";
  const h = Math.floor(m / 60);
  m %= 60;
  let r = "";
  if (h) r += `${h} hr${h > 1 ? "s" : ""}`;
  if (m) r += ` ${m} min${m > 1 ? "s" : ""}`;
  return r.trim() || "—";
}

/** A title for a dialog, cut so it fits. */
function shortTitle(subject: string | null): string {
  const title = subject ?? messages.app.untitled;
  return title.length > 40 ? `${title.slice(0, 37)}…` : title;
}

type MeetingForm = {
  meeting: MeetingRow;
  canEdit: boolean;
  formKey: string;
  errors: Errors;
  summary: { part: Part; message: string } | null;
  conflict: boolean;
  pending: boolean;
  register: (part: Part) => (element: HTMLFormElement | null) => void;
  save: (part: Part, form: HTMLFormElement) => void;
  validateField: (name: string) => void;
  markDirty: () => void;
  reload: () => void;
  leave: (navigate: () => void) => void;
  remove: (listHref: string, settled: () => void) => void;
};

const MeetingFormContext = createContext<MeetingForm | null>(null);

function useMeetingForm(): MeetingForm {
  const form = useContext(MeetingFormContext);
  if (!form) throw new Error("The meeting form parts need a MeetingFormScope");
  return form;
}

/**
 * One meeting form in two parts: the details at the top of the workspace and
 * the summary under the agenda. Either Save posts
 * the whole meeting from both parts' fields, so a save never drops the other
 * part's edits and an error on a field in the other part still shows on it.
 * Blur and submit validation against the action's schema, CONFLICT with a
 * reload, unsaved changes guarded through the page's UnsavedChangesScope.
 */
export function MeetingFormScope({
  meeting,
  canEdit,
  children,
}: {
  meeting: MeetingRow;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const pageHistory = usePageHistory();
  const form = useZodForm(updateMeetingFormSchema);
  const forms = useRef<Partial<Record<Part, HTMLFormElement | null>>>({});
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<MeetingForm["summary"]>(null);
  const [conflict, setConflict] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { leave, markClean, forgetAll } = useUnsavedPart("meeting", isDirty);

  const formKey = meetingFormKey(meeting);
  const [shownKey, setShownKey] = useState(formKey);
  if (shownKey !== formKey) {
    setShownKey(formKey);
    setIsDirty(false);
    setSummary(null);
    setConflict(false);
    form.reset();
  }

  const register = useCallback(
    (part: Part) => (element: HTMLFormElement | null) => {
      forms.current[part] = element;
    },
    [],
  );

  /** The saved meeting with both parts' fields over it: a part not shown keeps its saved values. */
  const collect = () => {
    const data = new FormData();
    for (const [name, value] of Object.entries(meetingFormValues(meeting))) {
      data.set(name, String(value ?? ""));
    }
    for (const element of Object.values(forms.current)) {
      if (!element) continue;
      for (const [name, value] of new FormData(element)) data.set(name, value);
    }
    return data;
  };

  const expired = (code: string) => {
    if (code !== "UNAUTHENTICATED") return false;
    router.push("/login?reason=expired");
    return true;
  };

  /** The refusal, naming the fields that sit in the other part of the form. */
  const refusal = (data: FormData, element: HTMLFormElement): string => {
    const parsed = updateMeetingFormSchema.safeParse(Object.fromEntries(data.entries()));
    const elsewhere = parsed.success
      ? []
      : parsed.error.issues.flatMap((issue) => {
          const name = String(issue.path[0] ?? "");
          return name in FIELD_LABELS && !element.elements.namedItem(name)
            ? [`${FIELD_LABELS[name]}: ${issue.message}`]
            : [];
        });
    return elsewhere.length > 0 ? elsewhere.join(" ") : messages.errors.summaryTitle;
  };

  const save = (part: Part, element: HTMLFormElement) => {
    const data = collect();
    if (!form.validate(data)) {
      setSummary({ part, message: refusal(data, element) });
      return;
    }
    setSummary(null);
    setConflict(false);
    startTransition(async () => {
      const result = await updateMeetingAction(data);
      if (result.ok) {
        const step = formEditStep({
          label: messages.pageHistory.changesTo(stepName(result.data.Subject)),
          key: recordKey("meetings", meeting.MeetingId),
          before: meeting,
          saved: result.data,
          toFormValues: meetingFormValues,
          update: updateMeetingAction,
          book: pageHistory.book,
        });
        if (step) pageHistory.record(step);
        markClean();
        setIsDirty(false);
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        router.refresh();
        notifySaved();
      } else if (!expired(result.error.code)) {
        form.applyResult(result);
        setSummary({ part, message: result.error.message });
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });
  };

  const remove = (listHref: string, settled: () => void) =>
    startTransition(async () => {
      const result = await deleteMeetingAction({
        meetingId: meeting.MeetingId,
        rowVer: meeting.RowVer,
      });
      settled();
      if (result.ok) {
        forgetAll();
        setIsDirty(false);
        toast({ variant: "success", title: messages.feedback.deleted });
        announce(messages.feedback.deleted);
        router.push(listHref);
      } else if (!expired(result.error.code)) {
        setSummary({ part: "details", message: result.error.message });
        if (result.error.code === "CONFLICT") setConflict(true);
      }
    });

  const value: MeetingForm = {
    meeting,
    canEdit,
    formKey,
    errors: form.errors,
    summary,
    conflict,
    pending,
    register,
    save,
    validateField: (name) => form.validate(collect(), name),
    markDirty: () => setIsDirty(true),
    reload: () => router.refresh(),
    leave,
    remove,
  };

  return <MeetingFormContext.Provider value={value}>{children}</MeetingFormContext.Provider>;
}

/** One part of the meeting form, remounted with the saved values after any save of the meeting. */
function MeetingPartForm({
  part,
  title,
  level,
  fields,
  exit,
}: {
  part: Part;
  title: string;
  level: "h2" | "h3";
  fields: (values: FormValues, errors: Errors) => React.ReactNode;
  exit?: { listHref: string; canDelete: boolean };
}) {
  const router = useRouter();
  const meetingForm = useMeetingForm();
  const { meeting, canEdit, errors, summary, conflict, pending } = meetingForm;
  const headingId = useId();
  const readOnlyId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const values = meetingFormValues(meeting);
  const Heading = level;

  return (
    <section className={PANEL_SHELL} aria-labelledby={headingId}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Heading
          id={headingId}
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          {title}
        </Heading>
      </div>
      <form
        key={meetingForm.formKey}
        ref={meetingForm.register(part)}
        noValidate
        onBlur={
          canEdit
            ? (event) => {
                const name = (event.target as HTMLElement & { name?: string }).name;
                if (name) meetingForm.validateField(name);
              }
            : undefined
        }
        onSubmit={(event) => {
          event.preventDefault();
          meetingForm.save(part, event.currentTarget);
        }}
        onChange={canEdit ? meetingForm.markDirty : undefined}
        data-testid={part === "details" ? "meeting-header-form" : "meeting-notes-form"}
        aria-labelledby={headingId}
        className={PANEL_BODY}
      >
        <ErrorSummary message={summary?.part === part ? summary.message : null} />
        {conflict && summary?.part === part ? (
          <div>
            <Button type="button" variant="secondary" onClick={meetingForm.reload}>
              {M.reload}
            </Button>
          </div>
        ) : null}

        {!canEdit ? (
          <p id={readOnlyId} className="sr-only">
            {messages.app.readOnly}
          </p>
        ) : null}
        <fieldset
          disabled={!canEdit}
          aria-describedby={canEdit ? undefined : readOnlyId}
          className="flex flex-col gap-5"
        >
          {fields(values, errors)}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
          {canEdit ? (
            <Button
              type="submit"
              pending={pending}
              data-testid={part === "details" ? "meeting-save" : "meeting-notes-save"}
            >
              {messages.actions.save}
            </Button>
          ) : null}
          {exit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => meetingForm.leave(() => router.push(exit.listHref))}
            >
              {messages.actions.cancel}
            </Button>
          ) : null}
          {exit?.canDelete ? (
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
      </form>

      {exit?.canDelete ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={messages.confirmDelete.title(M.entity, shortTitle(meeting.Subject))}
          body={messages.confirmDelete.body}
          confirmLabel={messages.actions.delete}
          onConfirm={() => meetingForm.remove(exit.listHref, () => setConfirmDelete(false))}
          pending={pending}
        />
      ) : null}
    </section>
  );
}

/**
 * The top of the workspace in the client's order: title, date and times,
 * then Location, which the participant panel follows directly (client
 * feedback 2026-10-23 and 2026-11-19).
 */
function MeetingHeaderFields({ values, errors }: { values: FormValues; errors: Errors }) {
  const { canEdit, markDirty } = useMeetingForm();
  const initialFormat = (values.meetingFormat as MeetingFormat) || "Hybrid";
  const [format, setFormat] = useState<MeetingFormat>(initialFormat);
  const [startTime, setStartTime] = useState<string>((values.startTime as string) ?? "");
  const [endTime, setEndTime] = useState<string>((values.endTime as string) ?? "");

  const duration = computeDuration(startTime, endTime);

  return (
    <>
      <input type="hidden" name="meetingFormat" value={format} />
      <Field label={M.subject} name="subject" errors={errors.subject}>
        <Input
          name="subject"
          maxLength={255}
          defaultValue={values.subject}
          placeholder="e.g. Q4 Product Strategy Sync"
        />
      </Field>

      {/* Meeting Date, Start Time, End Time, Duration in ONE single row on desktop */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <Field label={M.startDate} name="startDate" errors={errors.startDate}>
          <DatePicker name="startDate" defaultValue={values.startDate as string} />
        </Field>
        <Field label={M.startTime} name="startTime" errors={errors.startTime}>
          <Input
            name="startTime"
            type="time"
            defaultValue={values.startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>
        <Field label={M.endTime} name="endTime" errors={errors.endTime}>
          <Input
            name="endTime"
            type="time"
            defaultValue={values.endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-1.5 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {M.duration}
          </span>
          <div className="min-h-9 flex items-center text-sm font-medium text-ink">{duration}</div>
        </div>
      </div>

      {/* Meeting Format together on the same line with Location and/or Meeting Link */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {M.meetingFormat}
          </span>
          <div
            className="inline-flex h-10 items-center rounded-md border border-line bg-surface p-1"
            role="radiogroup"
            aria-label={M.meetingFormat}
          >
            {(["Hybrid", "Online", "Physical"] as const).map((fmt) => {
              const isSelected = format === fmt;
              let activeStyle = "";
              if (isSelected) {
                if (fmt === "Hybrid")
                  activeStyle = "bg-indigo-600 text-white border-indigo-600 shadow-sm";
                else if (fmt === "Online")
                  activeStyle = "bg-blue-600 text-white border-blue-600 shadow-sm";
                else if (fmt === "Physical")
                  activeStyle = "bg-emerald-600 text-white border-emerald-600 shadow-sm";
              } else {
                activeStyle =
                  "text-ink-muted hover:text-ink hover:bg-surface-soft border-transparent";
              }
              return (
                <button
                  key={fmt}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setFormat(fmt);
                    markDirty();
                  }}
                  className={`h-8 px-3.5 text-xs font-semibold rounded transition-colors border ${activeStyle}`}
                >
                  {fmt === "Hybrid"
                    ? M.meetingFormatHybrid
                    : fmt === "Online"
                      ? M.meetingFormatOnline
                      : M.meetingFormatPhysical}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex-1 min-w-0"
          style={{ display: format === "Online" ? "none" : undefined }}
        >
          <Field label={M.location} name="location" errors={errors.location}>
            <Input
              name="location"
              maxLength={255}
              defaultValue={values.location}
              placeholder="e.g. Kilimani Boardroom 4A"
            />
          </Field>
        </div>

        <div
          className="flex-1 min-w-0"
          style={{ display: format === "Physical" ? "none" : undefined }}
        >
          <Field label={M.meetingLink} name="meetingLink" errors={errors.meetingLink}>
            <Input
              name="meetingLink"
              type="url"
              maxLength={255}
              defaultValue={values.meetingLink}
              placeholder="https://meet.google.com/..."
            />
          </Field>
        </div>
      </div>

      {/* Next Meeting Date and Next Meeting Link */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={M.nextMeeting} name="nextMeeting" errors={errors.nextMeeting}>
          <DatePicker name="nextMeeting" defaultValue={values.nextMeeting as string} />
        </Field>
        <Field label={M.nextMeetingLink} name="nextMeetingLink" errors={errors.nextMeetingLink}>
          <Input
            name="nextMeetingLink"
            type="url"
            maxLength={255}
            defaultValue={values.nextMeetingLink}
            placeholder="https://meet.google.com/..."
          />
        </Field>
      </div>
    </>
  );
}

export function MeetingHeaderForm({
  listHref,
  canDelete,
}: {
  listHref: string;
  canDelete: boolean;
}) {
  return (
    <MeetingPartForm
      part="details"
      title={M.details}
      level="h2"
      exit={{ listHref, canDelete }}
      fields={(values, errors) => <MeetingHeaderFields values={values} errors={errors} />}
    />
  );
}

/** Objective, description, conclusion and date received, under the agenda. */
export function MeetingNotesForm() {
  return (
    <MeetingPartForm
      part="notes"
      title={M.notes}
      level="h3"
      fields={(values, errors) => (
        <>
          <Field label={M.objective} name="objective" errors={errors.objective}>
            <RichTextEditor name="objective" defaultValue={values.objective as string} />
          </Field>
          <Field label={M.description} name="description" errors={errors.description}>
            <RichTextEditor name="description" defaultValue={values.description as string} />
          </Field>
          <Field label={M.conclusion} name="conclusion" errors={errors.conclusion}>
            <RichTextEditor name="conclusion" defaultValue={values.conclusion as string} />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label={M.dateReceived} name="dateReceived" errors={errors.dateReceived}>
              <DatePicker name="dateReceived" defaultValue={values.dateReceived as string} />
            </Field>
          </div>
        </>
      )}
    />
  );
}
