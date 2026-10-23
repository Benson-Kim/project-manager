import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { guestKey } from "./participant-roster";
import { richTextSchema } from "@/lib/rich-text/schema";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { DEFAULT_ACTION_STATUS, actionStatusSchema, type MeetingRow } from "./meeting";

/**
 * Meeting form contracts (ADR-0009, ADR-0028): ONE schema per form, shared by
 * the browser (blur + submit validation over FormData strings) and the Server
 * Actions. Rich-text fields sanitise on the server (ADR-0025).
 */

const M = messages.meetings;

/** Sanitised HTML limit for the rich-text fields (stored as NVARCHAR(MAX)). */
export const MEETING_RICH_TEXT_MAX = 50_000;
/** Plain-text limit for agenda items and actions (stored as NVARCHAR(MAX)). */
export const MEETING_TEXT_MAX = 4000;
/** Most entries one reorder or participant save may carry (the procs' limits). */
export const MEETING_REORDER_MAX = 500;
export const MEETING_PARTICIPANTS_MAX = 1000;
/** Most carried-over actions one workspace read answers with (ADR-0041). */
export const MEETING_CARRY_OVER_MAX = 500;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const id = z.coerce.number().int().positive();

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v == null || String(v).trim() === "" ? null : String(v).trim()),
    z.string().max(max).nullable(),
  );

const dateInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), messages.errors.VALIDATION)
  .transform((v) => (v ? new Date(v) : null));

/** "HH:mm" from <input type="time">; empty is no time. */
const timeInput = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || TIME.test(v), M.invalidTime)
  .transform((v) => (v ? v : null));

const headerFields = {
  subject: z.string({ error: M.titleRequired }).trim().min(1, M.titleRequired).max(255),
  objective: richTextSchema({ max: MEETING_RICH_TEXT_MAX }),
  dateReceived: dateInput,
  description: richTextSchema({ max: MEETING_RICH_TEXT_MAX }),
  location: optionalText(255),
  startDate: dateInput,
  startTime: timeInput,
  endTime: timeInput,
  conclusion: richTextSchema({ max: MEETING_RICH_TEXT_MAX }),
  nextMeeting: dateInput,
  followupAction: optionalText(255),
};

/** The end time must come after the start time (the issue sits on endTime). */
function timesInOrder(
  value: { startTime: string | null; endTime: string | null },
  ctx: z.RefinementCtx,
) {
  const { startTime, endTime } = value;
  if (!startTime || !endTime || !TIME.test(startTime) || !TIME.test(endTime)) return;
  if (endTime <= startTime) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: M.endAfterStart });
  }
}

/** A meeting with its header filled in (the datasheet's new row). */
export const meetingFormSchema = z
  .object({ projectId: id, ...headerFields })
  .superRefine(timesInOrder);
export type MeetingFormValues = z.output<typeof meetingFormSchema>;

/**
 * The workspace header and every datasheet cell edit (ADR-0023). No project:
 * a meeting never moves, and a project-less legacy meeting stays editable.
 */
export const updateMeetingFormSchema = z
  .object({ ...headerFields, meetingId: id, rowVer: rowVerSchema })
  .superRefine(timesInOrder);
export type UpdateMeetingFormValues = z.output<typeof updateMeetingFormSchema>;

/** "New meeting": an empty draft the workspace then fills in (checklist row 53). */
export const createMeetingDraftSchema = z.object({ projectId: id });
export type CreateMeetingDraftValues = z.output<typeof createMeetingDraftSchema>;

export const deleteMeetingSchema = z.object({ meetingId: id, rowVer: rowVerSchema });

/**
 * A meeting as the update form's values: what a datasheet cell edit sends.
 * Access saved "no time" as 00:00, so a 00:00–00:00 pair reads as no times.
 */
export function meetingFormValues(row: MeetingRow): FormValues {
  const noTimes = row.StartTime === "00:00" && row.EndTime === "00:00";
  return {
    meetingId: String(row.MeetingId),
    rowVer: String(row.RowVer),
    subject: formText(row.Subject),
    objective: formText(row.Objective),
    dateReceived: toDateInput(row.DateReceived),
    description: formText(row.Description),
    location: formText(row.Location),
    startDate: toDateInput(row.StartDate),
    startTime: noTimes ? "" : formText(row.StartTime),
    endTime: noTimes ? "" : formText(row.EndTime),
    conclusion: formText(row.Conclusion),
    nextMeeting: toDateInput(row.NextMeeting),
    followupAction: formText(row.FollowupAction),
  };
}

// ── Minutes: agenda → discussion points → action items ───────────────────────

const plainText = (required: string) =>
  z.string({ error: required }).trim().min(1, required).max(MEETING_TEXT_MAX);

export const createAgendaItemSchema = z.object({
  meetingId: id,
  agendaItem: plainText(M.agendaItemRequired),
});
export const updateAgendaItemSchema = z.object({
  meetingAgendaItemId: id,
  rowVer: rowVerSchema,
  agendaItem: plainText(M.agendaItemRequired),
});
export const deleteAgendaItemSchema = z.object({ meetingAgendaItemId: id, rowVer: rowVerSchema });

export const createDiscussionPointSchema = z.object({
  agendaItemId: id,
  discussionPoint: richTextSchema({
    max: MEETING_RICH_TEXT_MAX,
    required: M.discussionPointRequired,
  }),
});
export const updateDiscussionPointSchema = z.object({
  meetingDiscussionPointId: id,
  rowVer: rowVerSchema,
  discussionPoint: richTextSchema({
    max: MEETING_RICH_TEXT_MAX,
    required: M.discussionPointRequired,
  }),
});
export const deleteDiscussionPointSchema = z.object({
  meetingDiscussionPointId: id,
  rowVer: rowVerSchema,
});

const optionalId = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().positive().nullable(),
);

const actionFields = {
  action: plainText(M.actionRequired),
  /** Person responsible (checklist row 13): a stakeholder of the meeting's project. */
  assignedToStakeholderId: optionalId,
  dueDate: dateInput,
  /** ADR-0041; an empty field (a form from before the status existed) is the default. */
  status: z.preprocess(
    (v) => (v === "" || v == null ? DEFAULT_ACTION_STATUS : v),
    actionStatusSchema,
  ),
};

/** The parent is a discussion point, else an agenda item; the proc derives the rest. */
export const createActionItemSchema = z
  .object({ discussionPointId: optionalId, agendaItemId: optionalId, ...actionFields })
  .superRefine((value, ctx) => {
    if (value.discussionPointId == null && value.agendaItemId == null) {
      ctx.addIssue({ code: "custom", path: ["agendaItemId"], message: M.actionParentRequired });
    }
  });
export const updateActionItemSchema = z.object({
  meetingActionItemId: id,
  rowVer: rowVerSchema,
  ...actionFields,
});
export const deleteActionItemSchema = z.object({ meetingActionItemId: id, rowVer: rowVerSchema });

/**
 * Ticking an action off, from its own form or from a later meeting's
 * carried-over list (ADR-0041). It carries the status and nothing else, so a
 * reader who never saw the action's text cannot overwrite it.
 */
export const setActionItemStatusSchema = z.object({
  meetingActionItemId: id,
  rowVer: rowVerSchema,
  status: actionStatusSchema,
});

// ── Action follow-ups (the one-to-many under an action item, ADR-0041) ───────

const followUpFields = {
  followUp: plainText(M.followUpRequired),
  /** The person assigned: a stakeholder of the meeting's project, as for an action. */
  assignedToStakeholderId: optionalId,
  followUpDate: dateInput,
  dueDate: dateInput,
};

export const createFollowUpSchema = z.object({ meetingActionItemId: id, ...followUpFields });
export const updateFollowUpSchema = z.object({
  meetingActionFollowUpId: id,
  rowVer: rowVerSchema,
  ...followUpFields,
});
export const deleteFollowUpSchema = z.object({
  meetingActionFollowUpId: id,
  rowVer: rowVerSchema,
});

/** A new order: every sibling once, at the RowVer the client read. */
const orderSchema = z
  .array(z.object({ id, rowVer: rowVerSchema }))
  .max(MEETING_REORDER_MAX)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    messages.errors.VALIDATION,
  );

export const reorderAgendaSchema = z.object({ meetingId: id, order: orderSchema });
export const reorderDiscussionPointsSchema = z.object({ agendaItemId: id, order: orderSchema });
export const reorderFollowUpsSchema = z.object({ meetingActionItemId: id, order: orderSchema });
export const reorderActionItemsSchema = z
  .object({ discussionPointId: optionalId, agendaItemId: optionalId, order: orderSchema })
  .superRefine((value, ctx) => {
    if ((value.discussionPointId == null) === (value.agendaItemId == null)) {
      ctx.addIssue({ code: "custom", path: ["agendaItemId"], message: M.actionParentRequired });
    }
  });

// ── Participants ─────────────────────────────────────────────────────────────

const guestText = z.string().trim().max(255, messages.errors.VALIDATION);

/** One person in the panel's save: a stakeholder of the project, or a guest named in full. */
const participantItemSchema = z.union([
  z.object({ stakeholderId: id, isApology: z.boolean() }),
  z.object({
    guestName: guestText.min(1, messages.meetings.guestProblem.empty),
    guestOrganization: guestText.nullish().transform((value) => value || null),
    isApology: z.boolean(),
  }),
]);

/**
 * The participant panel: who attended and who sent apologies; everyone else is
 * not invited. A stakeholder is listed once by id, a guest once by name.
 */
export const setParticipantsSchema = z.object({
  meetingId: id,
  stamp: rowVerSchema,
  participants: z
    .array(participantItemSchema)
    .max(MEETING_PARTICIPANTS_MAX)
    .refine((items) => {
      const stakeholders = items.flatMap((item) =>
        "stakeholderId" in item ? [item.stakeholderId] : [],
      );
      const guests = items.flatMap((item) =>
        "guestName" in item ? [guestKey(item.guestName)] : [],
      );
      return (
        new Set(stakeholders).size === stakeholders.length && new Set(guests).size === guests.length
      );
    }, messages.errors.VALIDATION),
});

export type CreateAgendaItemValues = z.output<typeof createAgendaItemSchema>;
export type UpdateAgendaItemValues = z.output<typeof updateAgendaItemSchema>;
export type CreateDiscussionPointValues = z.output<typeof createDiscussionPointSchema>;
export type UpdateDiscussionPointValues = z.output<typeof updateDiscussionPointSchema>;
export type CreateActionItemValues = z.output<typeof createActionItemSchema>;
export type UpdateActionItemValues = z.output<typeof updateActionItemSchema>;
export type SetActionItemStatusValues = z.output<typeof setActionItemStatusSchema>;
export type CreateFollowUpValues = z.output<typeof createFollowUpSchema>;
export type UpdateFollowUpValues = z.output<typeof updateFollowUpSchema>;
export type ReorderAgendaValues = z.output<typeof reorderAgendaSchema>;
export type ReorderDiscussionPointsValues = z.output<typeof reorderDiscussionPointsSchema>;
export type ReorderActionItemsValues = z.output<typeof reorderActionItemsSchema>;
export type ReorderFollowUpsValues = z.output<typeof reorderFollowUpsSchema>;
export type SetParticipantsValues = z.output<typeof setParticipantsSchema>;
