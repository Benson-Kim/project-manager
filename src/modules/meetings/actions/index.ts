"use server";

import { action } from "@/lib/action";
import {
  createActionItem,
  createAgendaItem,
  createDiscussionPoint,
  createMeeting,
  createMeetingDraft,
  deleteActionItem,
  deleteAgendaItem,
  deleteDiscussionPoint,
  deleteMeeting,
  reorderActionItems,
  reorderAgendaItems,
  reorderDiscussionPoints,
  setParticipants,
  updateActionItem,
  updateAgendaItem,
  updateDiscussionPoint,
  updateMeeting,
} from "../repository/meetings";
import {
  createActionItemSchema,
  createAgendaItemSchema,
  createDiscussionPointSchema,
  createMeetingDraftSchema,
  deleteActionItemSchema,
  deleteAgendaItemSchema,
  deleteDiscussionPointSchema,
  deleteMeetingSchema,
  meetingFormSchema,
  reorderActionItemsSchema,
  reorderAgendaSchema,
  reorderDiscussionPointsSchema,
  setParticipantsSchema,
  updateActionItemSchema,
  updateAgendaItemSchema,
  updateDiscussionPointSchema,
  updateMeetingFormSchema,
} from "../schemas/meeting-form";

/**
 * Meeting actions (ADR-0028). The global role is checked here; the project
 * level (Contributor to write, Manager to delete) and per-person overrides
 * are checked in-proc (ADR-0021, ADR-0024), which also write the audit rows.
 * The targets are route patterns; action() revalidates them as pages, which
 * reaches every rendered instance (the routes are dynamic, session cookie).
 */
const REVALIDATE_TARGETS = ["/projects/[id]/meetings", "/projects/[id]/meetings/[meetingId]"];

/** "New meeting": an empty draft the workspace opens on; its title is asked for there. */
export const createMeetingDraftAction = action({
  name: "meetings.create-draft",
  schema: createMeetingDraftSchema,
  permission: "meetings:create",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createMeetingDraft(input.projectId, ctx.session.userId),
});

export const createMeetingAction = action({
  name: "meetings.create",
  schema: meetingFormSchema,
  permission: "meetings:create",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createMeeting(input, ctx.session.userId),
});

/** The workspace header and datasheet cell edits (CONFLICT on a stale RowVer). */
export const updateMeetingAction = action({
  name: "meetings.update",
  schema: updateMeetingFormSchema,
  permission: "meetings:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => updateMeeting(input, ctx.session.userId),
});

/** Soft-deletes the meeting with its minutes and participants. */
export const deleteMeetingAction = action({
  name: "meetings.delete",
  schema: deleteMeetingSchema,
  permission: "meetings:delete",
  revalidate: REVALIDATE_TARGETS,
  handler: async (input, ctx) => {
    await deleteMeeting(input.meetingId, input.rowVer, ctx.session.userId);
    return { deleted: true as const };
  },
});

/*
 * Minutes and participants. Each edit answers with the meeting's whole
 * workspace, which the page shows in place of its own guess, so these do not
 * revalidate the workspace; participant saves revalidate the list, whose rows
 * count attendees and apologies.
 */

export const createAgendaItemAction = action({
  name: "meetings.agenda-create",
  schema: createAgendaItemSchema,
  permission: "meetings:create",
  handler: (input, ctx) => createAgendaItem(input, ctx.session.userId),
});

export const updateAgendaItemAction = action({
  name: "meetings.agenda-update",
  schema: updateAgendaItemSchema,
  permission: "meetings:update",
  handler: (input, ctx) => updateAgendaItem(input, ctx.session.userId),
});

/** Deletes the agenda item with its discussion points and actions. */
export const deleteAgendaItemAction = action({
  name: "meetings.agenda-delete",
  schema: deleteAgendaItemSchema,
  permission: "meetings:delete",
  handler: (input, ctx) => deleteAgendaItem(input, ctx.session.userId),
});

export const reorderAgendaItemsAction = action({
  name: "meetings.agenda-reorder",
  schema: reorderAgendaSchema,
  permission: "meetings:update",
  handler: (input, ctx) => reorderAgendaItems(input, ctx.session.userId),
});

export const createDiscussionPointAction = action({
  name: "meetings.discussion-create",
  schema: createDiscussionPointSchema,
  permission: "meetings:create",
  handler: (input, ctx) => createDiscussionPoint(input, ctx.session.userId),
});

export const updateDiscussionPointAction = action({
  name: "meetings.discussion-update",
  schema: updateDiscussionPointSchema,
  permission: "meetings:update",
  handler: (input, ctx) => updateDiscussionPoint(input, ctx.session.userId),
});

/** Deletes the discussion point with its actions. */
export const deleteDiscussionPointAction = action({
  name: "meetings.discussion-delete",
  schema: deleteDiscussionPointSchema,
  permission: "meetings:delete",
  handler: (input, ctx) => deleteDiscussionPoint(input, ctx.session.userId),
});

export const reorderDiscussionPointsAction = action({
  name: "meetings.discussion-reorder",
  schema: reorderDiscussionPointsSchema,
  permission: "meetings:update",
  handler: (input, ctx) => reorderDiscussionPoints(input, ctx.session.userId),
});

export const createActionItemAction = action({
  name: "meetings.action-create",
  schema: createActionItemSchema,
  permission: "meetings:create",
  handler: (input, ctx) => createActionItem(input, ctx.session.userId),
});

export const updateActionItemAction = action({
  name: "meetings.action-update",
  schema: updateActionItemSchema,
  permission: "meetings:update",
  handler: (input, ctx) => updateActionItem(input, ctx.session.userId),
});

export const deleteActionItemAction = action({
  name: "meetings.action-delete",
  schema: deleteActionItemSchema,
  permission: "meetings:delete",
  handler: (input, ctx) => deleteActionItem(input, ctx.session.userId),
});

export const reorderActionItemsAction = action({
  name: "meetings.action-reorder",
  schema: reorderActionItemsSchema,
  permission: "meetings:update",
  handler: (input, ctx) => reorderActionItems(input, ctx.session.userId),
});

/** Who attended and who sent apologies (CONFLICT when the panel's stamp is stale). */
export const setParticipantsAction = action({
  name: "meetings.participants-set",
  schema: setParticipantsSchema,
  permission: "meetings:update",
  revalidate: ["/projects/[id]/meetings"],
  handler: (input, ctx) => setParticipants(input, ctx.session.userId),
});
