import { z } from "zod";
import { actorAccessFields } from "@/lib/auth/actor-access";
import { rowVerSchema } from "@/modules/projects/schemas/project";

/**
 * Meetings — zod contracts for the rows of usp_Meeting_* and the child procs
 * (ADR-0028). Description, Objective, Conclusion and DiscussionPoint are rich
 * text (ADR-0025): the repository sanitises them again on the way out.
 */

/**
 * A meeting time as "HH:mm", the value of <input type="time">. mssql returns
 * TIME(0) as a Date on 1970-01-01 UTC; a string ("17:00" or "17:00:00") is cut
 * to minutes.
 */
export const timeOfDaySchema = z
  .union([z.date(), z.string()])
  .nullable()
  .transform((v) => {
    if (v == null) return null;
    if (typeof v === "string") return v.slice(0, 5);
    const hh = String(v.getUTCHours()).padStart(2, "0");
    const mm = String(v.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  });

/**
 * An action item's status (ADR-0041). A closed set, not a managed lookup list:
 * "completed" is what stops an action carrying into the project's later
 * meetings, so renaming a value would change a rule. CK_MeetingActionItem_Status
 * holds the same three; src/tests/meeting-sql-guardrails.test.ts ties them.
 */
export const ACTION_STATUSES = ["on-hold", "in-progress", "completed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const actionStatusSchema = z.enum(ACTION_STATUSES);
/** What a new action starts as, and what every action was before the status existed. */
export const DEFAULT_ACTION_STATUS: ActionStatus = "in-progress";
/** An action still counts against the meeting while it is not completed. */
export const isOpenStatus = (status: ActionStatus): boolean => status !== "completed";

/** A JSON array column (FOR JSON PATH); NULL (no rows) is an empty array. */
function jsonArray<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (raw) => (raw == null || raw === "" ? [] : typeof raw === "string" ? JSON.parse(raw) : raw),
    z.array(item),
  );
}

const meetingFields = {
  MeetingId: z.number().int(),
  ProjectId: z.number().int().nullable(),
  Subject: z.string().nullable(),
  Objective: z.string().nullable(),
  DateReceived: z.date().nullable(),
  Description: z.string().nullable(),
  Location: z.string().nullable(),
  StartDate: z.date().nullable(),
  StartTime: timeOfDaySchema,
  EndTime: timeOfDaySchema,
  Conclusion: z.string().nullable(),
  NextMeeting: z.date().nullable(),
  FollowupAction: z.string().nullable(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
};

export const meetingRowSchema = z.object(meetingFields);
export type MeetingRow = z.infer<typeof meetingRowSchema>;

export const meetingListRowSchema = z.object({
  ...meetingFields,
  AttendeeCount: z.number().int(),
  ApologyCount: z.number().int(),
  TotalCount: z.number().int(),
  ...actorAccessFields,
});
export type MeetingListRow = z.infer<typeof meetingListRowSchema>;

// ── Workspace (usp_Meeting_GetWorkspace) ─────────────────────────────────────

export const workspaceAgendaItemSchema = z.object({
  MeetingAgendaItemId: z.number().int(),
  AgendaItem: z.string().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});
export type WorkspaceAgendaItem = z.infer<typeof workspaceAgendaItemSchema>;

export const workspaceDiscussionPointSchema = z.object({
  MeetingDiscussionPointId: z.number().int(),
  AgendaItemId: z.number().int(),
  DiscussionPoint: z.string().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});
export type WorkspaceDiscussionPoint = z.infer<typeof workspaceDiscussionPointSchema>;

export const workspaceActionItemSchema = z.object({
  MeetingActionItemId: z.number().int(),
  AgendaItemId: z.number().int().nullable(),
  DiscussionPointId: z.number().int().nullable(),
  Action: z.string().nullable(),
  AssignedToStakeholderId: z.number().int().nullable(),
  AssigneeName: z.string().nullable(),
  /** "YYYY-MM-DD" (date only). */
  DueDate: z.string().nullable(),
  Status: actionStatusSchema,
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});
export type WorkspaceActionItem = z.infer<typeof workspaceActionItemSchema>;

/**
 * One follow-up under an action item (ADR-0041): the one-to-many the client
 * asked for, each with the person it is assigned to, the date it was made and
 * the date it is due. The status stays on the action item, so there is one
 * place to look for whether the action is done.
 */
export const workspaceFollowUpSchema = z.object({
  MeetingActionFollowUpId: z.number().int(),
  MeetingActionItemId: z.number().int(),
  FollowUp: z.string().nullable(),
  AssignedToStakeholderId: z.number().int().nullable(),
  AssigneeName: z.string().nullable(),
  /** "YYYY-MM-DD" (date only). */
  FollowUpDate: z.string().nullable(),
  /** "YYYY-MM-DD" (date only). */
  DueDate: z.string().nullable(),
  SortOrder: z.number().int(),
  RowVer: rowVerSchema,
});
export type WorkspaceFollowUp = z.infer<typeof workspaceFollowUpSchema>;

/**
 * An unfinished action of one of this project's earlier meetings, which carries
 * into every later one until it is completed (ADR-0041). Read-only here apart
 * from its status; the rest of it is edited where it was raised.
 */
export const carriedOverActionSchema = z.object({
  MeetingActionItemId: z.number().int(),
  Action: z.string().nullable(),
  Status: actionStatusSchema,
  AssignedToStakeholderId: z.number().int().nullable(),
  AssigneeName: z.string().nullable(),
  /** "YYYY-MM-DD" (date only). */
  DueDate: z.string().nullable(),
  RowVer: rowVerSchema,
  FromMeetingId: z.number().int(),
  FromSubject: z.string().nullable(),
  /** "YYYY-MM-DD" (date only); null when that meeting has no date yet. */
  FromStartDate: z.string().nullable(),
});
export type CarriedOverAction = z.infer<typeof carriedOverActionSchema>;

export const workspaceParticipantSchema = z.object({
  MeetingParticipantId: z.number().int(),
  /** Null for a guest (migration 033). */
  StakeholderId: z.number().int().nullable(),
  /** "Name - Position, Organization" (Access qryMeetingAttendees); "Name - Organization" for a guest. */
  Label: z.string(),
  IsApology: z.boolean(),
  StakeholderIsDeleted: z.boolean(),
  /** A guest: someone who attended without being a stakeholder. Both null for a stakeholder. */
  GuestName: z.string().nullable(),
  GuestOrganization: z.string().nullable(),
  RowVer: rowVerSchema,
});
export type WorkspaceParticipant = z.infer<typeof workspaceParticipantSchema>;

export const meetingWorkspaceRowSchema = z.object({
  ...meetingFields,
  AgendaItemsJson: jsonArray(workspaceAgendaItemSchema),
  DiscussionPointsJson: jsonArray(workspaceDiscussionPointSchema),
  ActionItemsJson: jsonArray(workspaceActionItemSchema),
  FollowUpsJson: jsonArray(workspaceFollowUpSchema),
  CarriedOverJson: jsonArray(carriedOverActionSchema),
  ParticipantsJson: jsonArray(workspaceParticipantSchema),
  ParticipantsStamp: rowVerSchema,
  Stamp: rowVerSchema,
});

/** The workspace as the app uses it: the meeting plus its child collections. */
export interface MeetingWorkspace {
  meeting: MeetingRow;
  agendaItems: WorkspaceAgendaItem[];
  discussionPoints: WorkspaceDiscussionPoint[];
  actionItems: WorkspaceActionItem[];
  followUps: WorkspaceFollowUp[];
  /** This project's earlier meetings' unfinished actions (ADR-0041). */
  carriedOver: CarriedOverAction[];
  participants: WorkspaceParticipant[];
  participantsStamp: number;
  stamp: number;
}

// ── Participant roster (usp_Meeting_GetRoster) ───────────────────────────────

export const rosterEntrySchema = z.object({
  /** Null for a guest (migration 033). */
  StakeholderId: z.number().int().nullable(),
  /** "Name - Position, Organization" (Access qryMeetingAttendees); "Name - Organization" for a guest. */
  Label: z.string(),
  /** Both null for a stakeholder who is not invited. */
  MeetingParticipantId: z.number().int().nullable(),
  IsApology: z.boolean().nullable(),
  /** A participant who is no longer a live stakeholder of the project: kept, read-only. */
  IsHistorical: z.boolean(),
  /** A guest's name and organization; both null for a stakeholder. */
  GuestName: z.string().nullable(),
  GuestOrganization: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export const meetingRosterRowSchema = z.object({
  ProjectId: z.number().int().nullable(),
  MeetingId: z.number().int(),
  ParticipantsStamp: rowVerSchema,
  RosterJson: jsonArray(rosterEntrySchema),
});

/** The participant panel's people, with the stamp read before them. */
export interface MeetingRoster {
  entries: RosterEntry[];
  stamp: number;
}

// ── Child rows (Create / Update / GetById / List of the child procs) ─────────

export const agendaItemRowSchema = z.object({
  MeetingAgendaItemId: z.number().int(),
  MeetingId: z.number().int().nullable(),
  AgendaItem: z.string().nullable(),
  SortOrder: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  ProjectId: z.number().int().nullable(),
});
export type AgendaItemRow = z.infer<typeof agendaItemRowSchema>;

export const discussionPointRowSchema = z.object({
  MeetingDiscussionPointId: z.number().int(),
  AgendaItemId: z.number().int(),
  DiscussionPoint: z.string().nullable(),
  SortOrder: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  MeetingId: z.number().int().nullable(),
  ProjectId: z.number().int().nullable(),
});
export type DiscussionPointRow = z.infer<typeof discussionPointRowSchema>;

export const actionItemRowSchema = z.object({
  MeetingActionItemId: z.number().int(),
  MeetingId: z.number().int().nullable(),
  AgendaItemId: z.number().int().nullable(),
  DiscussionPointId: z.number().int().nullable(),
  Action: z.string().nullable(),
  AssignedToStakeholderId: z.number().int().nullable(),
  AssigneeName: z.string().nullable(),
  DueDate: z.date().nullable(),
  Status: actionStatusSchema,
  SortOrder: z.number().int(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  ProjectId: z.number().int().nullable(),
});
export type ActionItemRow = z.infer<typeof actionItemRowSchema>;

export const participantRowSchema = z.object({
  MeetingParticipantId: z.number().int(),
  MeetingId: z.number().int().nullable(),
  StakeholderId: z.number().int(),
  Label: z.string(),
  IsApology: z.boolean(),
  StakeholderIsDeleted: z.boolean(),
  CreatedAtUtc: z.date(),
  UpdatedAtUtc: z.date().nullable(),
  RowVer: rowVerSchema,
  ProjectId: z.number().int().nullable(),
});
export type ParticipantRow = z.infer<typeof participantRowSchema>;

/** A printed-minutes line (usp_Meeting_GetAttendees / _GetApologies). */
export const attendeeRowSchema = z.object({
  MeetingParticipantId: z.number().int(),
  MeetingId: z.number().int(),
  /** Null for a guest. */
  StakeholderId: z.number().int().nullable(),
  Label: z.string(),
});
export type AttendeeRow = z.infer<typeof attendeeRowSchema>;

/** What a child delete or a reorder answers: where the change happened. */
export const meetingScopeRowSchema = z.object({
  ProjectId: z.number().int().nullable(),
  MeetingId: z.number().int().nullable(),
});
export type MeetingScopeRow = z.infer<typeof meetingScopeRowSchema>;

export const participantSetRowSchema = meetingScopeRowSchema.extend({
  ParticipantsStamp: rowVerSchema,
  AttendeeCount: z.number().int(),
  ApologyCount: z.number().int(),
});
export type ParticipantSetRow = z.infer<typeof participantSetRowSchema>;
