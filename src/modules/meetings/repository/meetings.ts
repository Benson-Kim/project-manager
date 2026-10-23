import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";
import {
  attendeeRowSchema,
  meetingListRowSchema,
  meetingRosterRowSchema,
  meetingRowSchema,
  meetingScopeRowSchema,
  meetingWorkspaceRowSchema,
  type AttendeeRow,
  type MeetingListRow,
  type MeetingRoster,
  type MeetingRow,
  type MeetingWorkspace,
} from "../schemas/meeting";
import type {
  CreateActionItemValues,
  CreateAgendaItemValues,
  CreateDiscussionPointValues,
  CreateFollowUpValues,
  MeetingFormValues,
  ReorderActionItemsValues,
  ReorderAgendaValues,
  ReorderDiscussionPointsValues,
  ReorderFollowUpsValues,
  SetActionItemStatusValues,
  SetParticipantsValues,
  UpdateActionItemValues,
  UpdateAgendaItemValues,
  UpdateDiscussionPointValues,
  UpdateFollowUpValues,
  UpdateMeetingFormValues,
} from "../schemas/meeting-form";

/**
 * Meetings repository (ADR-0028): stored procedures only, every row zod-parsed
 * at the boundary (STANDARDS §2.5). The procs check project access and write
 * the audit rows; nothing here decides who may do what. Rich text leaves
 * sanitised (ADR-0025), so legacy Access markup reaches the editor converted.
 */

const cleanHtml = (html: string | null) => (html ? sanitizeRichText(html) || null : html);

type RichFields = Pick<MeetingRow, "Objective" | "Description" | "Conclusion">;

function cleanMeeting<T extends RichFields>(row: T): T {
  return {
    ...row,
    Objective: cleanHtml(row.Objective),
    Description: cleanHtml(row.Description),
    Conclusion: cleanHtml(row.Conclusion),
  };
}

export interface MeetingFilters {
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

type HeaderValues = Omit<MeetingFormValues, "projectId"> | UpdateMeetingFormValues;

function headerParams(input: HeaderValues) {
  return {
    Subject: input.subject,
    Objective: input.objective ?? null,
    DateReceived: input.dateReceived ?? null,
    Description: input.description ?? null,
    Location: input.location ?? null,
    StartDate: input.startDate ?? null,
    StartTime: input.startTime ?? null,
    EndTime: input.endTime ?? null,
    Conclusion: input.conclusion ?? null,
    NextMeeting: input.nextMeeting ?? null,
    FollowupAction: input.followupAction ?? null,
  };
}

/** "New meeting": an empty meeting in the project, which the workspace then fills in. */
export async function createMeetingDraft(
  projectId: number,
  actorUserId: number,
): Promise<MeetingRow> {
  const rows = await execProc("usp_Meeting_Create", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return cleanMeeting(meetingRowSchema.parse(rows[0]));
}

export async function createMeeting(
  input: MeetingFormValues,
  actorUserId: number,
): Promise<MeetingRow> {
  const rows = await execProc("usp_Meeting_Create", {
    ProjectId: input.projectId,
    ...headerParams(input),
    ActorUserId: actorUserId,
  });
  return cleanMeeting(meetingRowSchema.parse(rows[0]));
}

export async function getMeetingById(meetingId: number, actorUserId: number): Promise<MeetingRow> {
  const rows = await execProc("usp_Meeting_GetById", {
    MeetingId: meetingId,
    ActorUserId: actorUserId,
  });
  return cleanMeeting(meetingRowSchema.parse(rows[0]));
}

export async function listMeetings(
  projectId: number | null,
  params: ListParams,
  actorUserId: number,
  filters: MeetingFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<MeetingListRow[]> {
  const rows = await execProc("usp_Meeting_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    DateFrom: filters.dateFrom ?? null,
    DateTo: filters.dateTo ?? null,
  });
  return rows.map((r) => cleanMeeting(meetingListRowSchema.parse(r)));
}

/** The project stays as it is: usp_Meeting_Update is never sent one. */
export async function updateMeeting(
  input: UpdateMeetingFormValues,
  actorUserId: number,
): Promise<MeetingRow> {
  const rows = await execProc("usp_Meeting_Update", {
    MeetingId: input.meetingId,
    ...headerParams(input),
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return cleanMeeting(meetingRowSchema.parse(rows[0]));
}

/** Soft-deletes the meeting with its minutes and participants (one transaction, in-proc). */
export async function deleteMeeting(
  meetingId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Meeting_Delete", {
    MeetingId: meetingId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}

/** Everything the workspace shows, from one call (usp_Meeting_GetWorkspace). */
export async function getMeetingWorkspace(
  meetingId: number,
  actorUserId: number,
): Promise<MeetingWorkspace> {
  const rows = await execProc("usp_Meeting_GetWorkspace", {
    MeetingId: meetingId,
    ActorUserId: actorUserId,
  });
  const row = meetingWorkspaceRowSchema.parse(rows[0]);
  const {
    AgendaItemsJson,
    DiscussionPointsJson,
    ActionItemsJson,
    FollowUpsJson,
    CarriedOverJson,
    ParticipantsJson,
    ParticipantsStamp,
    Stamp,
    ...meeting
  } = row;
  return {
    meeting: cleanMeeting(meeting),
    agendaItems: AgendaItemsJson,
    discussionPoints: DiscussionPointsJson.map((point) => ({
      ...point,
      DiscussionPoint: cleanHtml(point.DiscussionPoint),
    })),
    actionItems: ActionItemsJson,
    followUps: FollowUpsJson,
    carriedOver: CarriedOverJson,
    participants: ParticipantsJson,
    participantsStamp: ParticipantsStamp,
    stamp: Stamp,
  };
}

/**
 * The participant panel: every live stakeholder of the meeting's project with
 * their state, then participants kept for history (usp_Meeting_GetRoster). The
 * stamp is the one a save must send back.
 */
export async function getMeetingRoster(
  meetingId: number,
  actorUserId: number,
): Promise<MeetingRoster> {
  const rows = await execProc("usp_Meeting_GetRoster", {
    MeetingId: meetingId,
    ActorUserId: actorUserId,
  });
  const row = meetingRosterRowSchema.parse(rows[0]);
  return { entries: row.RosterJson, stamp: row.ParticipantsStamp };
}

/**
 * Who attended (Access qryMeetingAttendees). The printed minutes take the same
 * rows from the workspace.
 */
export async function listAttendees(
  meetingId: number,
  actorUserId: number,
): Promise<AttendeeRow[]> {
  const rows = await execProc("usp_Meeting_GetAttendees", {
    MeetingId: meetingId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => attendeeRowSchema.parse(r));
}

/**
 * Who sent apologies (Access qryMeetingApologies). The printed minutes take
 * the same rows from the workspace.
 */
export async function listApologies(
  meetingId: number,
  actorUserId: number,
): Promise<AttendeeRow[]> {
  const rows = await execProc("usp_Meeting_GetApologies", {
    MeetingId: meetingId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => attendeeRowSchema.parse(r));
}

/**
 * Minutes and participant edits answer with the meeting's whole workspace,
 * read for the meeting the proc reports (never one the caller names), so the
 * workspace shows every renumbered sibling at once. Null for a legacy row
 * that belongs to no meeting.
 */
async function workspaceAfter(
  proc: string,
  params: Record<string, string | number | Date | null>,
  actorUserId: number,
): Promise<MeetingWorkspace | null> {
  const rows = await execProc(proc, { ...params, ActorUserId: actorUserId });
  const scope = meetingScopeRowSchema.parse(rows[0]);
  return scope.MeetingId == null ? null : getMeetingWorkspace(scope.MeetingId, actorUserId);
}

const orderJson = (order: { id: number; rowVer: number }[]) => JSON.stringify(order);

export function createAgendaItem(input: CreateAgendaItemValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingAgendaItem_Create",
    { MeetingId: input.meetingId, AgendaItem: input.agendaItem },
    actorUserId,
  );
}

export function updateAgendaItem(input: UpdateAgendaItemValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingAgendaItem_Update",
    {
      MeetingAgendaItemId: input.meetingAgendaItemId,
      AgendaItem: input.agendaItem,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

/** Deletes the agenda item with its discussion points and actions. */
export function deleteAgendaItem(
  input: { meetingAgendaItemId: number; rowVer: number },
  actorUserId: number,
) {
  return workspaceAfter(
    "usp_MeetingAgendaItem_Delete",
    { MeetingAgendaItemId: input.meetingAgendaItemId, RowVer: input.rowVer },
    actorUserId,
  );
}

export function reorderAgendaItems(input: ReorderAgendaValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingAgendaItem_Reorder",
    { MeetingId: input.meetingId, OrderJson: orderJson(input.order) },
    actorUserId,
  );
}

export function createDiscussionPoint(input: CreateDiscussionPointValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingDiscussionPoint_Create",
    { AgendaItemId: input.agendaItemId, DiscussionPoint: input.discussionPoint },
    actorUserId,
  );
}

export function updateDiscussionPoint(input: UpdateDiscussionPointValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingDiscussionPoint_Update",
    {
      MeetingDiscussionPointId: input.meetingDiscussionPointId,
      DiscussionPoint: input.discussionPoint,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

/** Deletes the discussion point with its actions. */
export function deleteDiscussionPoint(
  input: { meetingDiscussionPointId: number; rowVer: number },
  actorUserId: number,
) {
  return workspaceAfter(
    "usp_MeetingDiscussionPoint_Delete",
    { MeetingDiscussionPointId: input.meetingDiscussionPointId, RowVer: input.rowVer },
    actorUserId,
  );
}

export function reorderDiscussionPoints(input: ReorderDiscussionPointsValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingDiscussionPoint_Reorder",
    { AgendaItemId: input.agendaItemId, OrderJson: orderJson(input.order) },
    actorUserId,
  );
}

/** The proc derives the agenda item and the meeting from the parent. */
export function createActionItem(input: CreateActionItemValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionItem_Create",
    {
      DiscussionPointId: input.discussionPointId,
      AgendaItemId: input.agendaItemId,
      Action: input.action,
      AssignedToStakeholderId: input.assignedToStakeholderId,
      DueDate: input.dueDate,
      Status: input.status,
    },
    actorUserId,
  );
}

/** Text, person responsible, due date and status; the parent never changes. */
export function updateActionItem(input: UpdateActionItemValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionItem_Update",
    {
      MeetingActionItemId: input.meetingActionItemId,
      Action: input.action,
      AssignedToStakeholderId: input.assignedToStakeholderId,
      DueDate: input.dueDate,
      Status: input.status,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

/**
 * The status on its own (ADR-0041), so a later meeting's carried-over list can
 * tick an action off without holding its text, person responsible or due date.
 */
export function setActionItemStatus(input: SetActionItemStatusValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionItem_SetStatus",
    {
      MeetingActionItemId: input.meetingActionItemId,
      Status: input.status,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

export function deleteActionItem(
  input: { meetingActionItemId: number; rowVer: number },
  actorUserId: number,
) {
  return workspaceAfter(
    "usp_MeetingActionItem_Delete",
    { MeetingActionItemId: input.meetingActionItemId, RowVer: input.rowVer },
    actorUserId,
  );
}

export function reorderActionItems(input: ReorderActionItemsValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionItem_Reorder",
    {
      DiscussionPointId: input.discussionPointId,
      AgendaItemId: input.agendaItemId,
      OrderJson: orderJson(input.order),
    },
    actorUserId,
  );
}

// ── Action follow-ups (the one-to-many under an action item, ADR-0041) ───────

/** The proc derives the meeting and the project from the action item. */
export function createFollowUp(input: CreateFollowUpValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionFollowUp_Create",
    {
      MeetingActionItemId: input.meetingActionItemId,
      FollowUp: input.followUp,
      AssignedToStakeholderId: input.assignedToStakeholderId,
      FollowUpDate: input.followUpDate,
      DueDate: input.dueDate,
    },
    actorUserId,
  );
}

/** Text, person assigned, follow-up date and due date; the action never changes. */
export function updateFollowUp(input: UpdateFollowUpValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionFollowUp_Update",
    {
      MeetingActionFollowUpId: input.meetingActionFollowUpId,
      FollowUp: input.followUp,
      AssignedToStakeholderId: input.assignedToStakeholderId,
      FollowUpDate: input.followUpDate,
      DueDate: input.dueDate,
      RowVer: input.rowVer,
    },
    actorUserId,
  );
}

export function deleteFollowUp(
  input: { meetingActionFollowUpId: number; rowVer: number },
  actorUserId: number,
) {
  return workspaceAfter(
    "usp_MeetingActionFollowUp_Delete",
    { MeetingActionFollowUpId: input.meetingActionFollowUpId, RowVer: input.rowVer },
    actorUserId,
  );
}

export function reorderFollowUps(input: ReorderFollowUpsValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingActionFollowUp_Reorder",
    { MeetingActionItemId: input.meetingActionItemId, OrderJson: orderJson(input.order) },
    actorUserId,
  );
}

/** Who attended and who sent apologies, from the stamp the panel read. */
export function setParticipants(input: SetParticipantsValues, actorUserId: number) {
  return workspaceAfter(
    "usp_MeetingParticipant_Set",
    {
      MeetingId: input.meetingId,
      ParticipantsJson: JSON.stringify(input.participants),
      Stamp: input.stamp,
    },
    actorUserId,
  );
}
