import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import "@/lib/rich-text/sanitize";
import { listParamsSchema } from "@/lib/list-params";
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
  getMeetingById,
  getMeetingWorkspace,
  listApologies,
  listAttendees,
  listMeetings,
  reorderActionItems,
  reorderAgendaItems,
  reorderDiscussionPoints,
  setParticipants,
  updateActionItem,
  updateAgendaItem,
  updateDiscussionPoint,
  updateMeeting,
} from "../repository/meetings";
import { meetingWorkspaceRowSchema, timeOfDaySchema } from "../schemas/meeting";
import {
  meetingFormSchema,
  updateActionItemSchema,
  updateAgendaItemSchema,
  updateMeetingFormSchema,
} from "../schemas/meeting-form";
import { meetingDbRow, meetingListDbRow, scopeDbRow, workspaceDbRow } from "./fixtures";

const ACTOR = 7;

function call(n = 0) {
  return execProc.mock.calls[n] as [string, Record<string, unknown>];
}

/** Child procs answer with their scope; the follow-up read is the workspace. */
function answerWith(scope: Record<string, unknown>) {
  execProc.mockImplementation((proc: string) =>
    Promise.resolve(proc === "usp_Meeting_GetWorkspace" ? [workspaceDbRow()] : [scope]),
  );
}

beforeEach(() => execProc.mockReset());

describe("meeting row schemas", () => {
  it("reads TIME(0) as HH:mm from a Date or a string", () => {
    expect(timeOfDaySchema.parse(new Date("1970-01-01T17:05:00Z"))).toBe("17:05");
    expect(timeOfDaySchema.parse("08:30:00")).toBe("08:30");
    expect(timeOfDaySchema.parse(null)).toBeNull();
  });

  it("reads a workspace whose child collections are empty (FOR JSON gives NULL)", () => {
    const row = meetingWorkspaceRowSchema.parse(
      workspaceDbRow({
        AgendaItemsJson: null,
        DiscussionPointsJson: null,
        ActionItemsJson: "",
        ParticipantsJson: null,
        ParticipantsStamp: "0",
      }),
    );
    expect(row.AgendaItemsJson).toEqual([]);
    expect(row.ActionItemsJson).toEqual([]);
    expect(row.ParticipantsStamp).toBe(0);
  });

  it("refuses a workspace item with a missing key", () => {
    const bad = JSON.stringify([{ MeetingAgendaItemId: 1, SortOrder: 1, RowVer: 1 }]);
    expect(
      meetingWorkspaceRowSchema.safeParse(workspaceDbRow({ AgendaItemsJson: bad })).success,
    ).toBe(false);
  });
});

describe("meetings repository: meetings", () => {
  it("a draft sends only the project and the actor", async () => {
    execProc.mockResolvedValue([
      meetingDbRow({ Subject: null, StartDate: null, StartTime: null, EndTime: null }),
    ]);
    const row = await createMeetingDraft(24, ACTOR);
    expect(call()).toEqual(["usp_Meeting_Create", { ProjectId: 24, ActorUserId: ACTOR }]);
    expect(row.Subject).toBeNull();
    expect(row.StartTime).toBeNull();
  });

  it("create forwards every header field", async () => {
    execProc.mockResolvedValue([meetingDbRow()]);
    const input = meetingFormSchema.parse({
      projectId: "24",
      subject: "Weekly progress",
      startDate: "2024-12-17",
      startTime: "09:00",
      endTime: "10:30",
    });
    const row = await createMeeting(input, ACTOR);
    const [proc, params] = call();
    expect(proc).toBe("usp_Meeting_Create");
    expect(params).toMatchObject({
      ProjectId: 24,
      Subject: "Weekly progress",
      StartDate: new Date("2024-12-17"),
      StartTime: "09:00",
      EndTime: "10:30",
      Objective: null,
      Location: null,
      ActorUserId: ACTOR,
    });
    expect(Object.keys(params)).toHaveLength(13);
    expect(row).toMatchObject({ MeetingId: 2, StartTime: "09:00", EndTime: "10:30", RowVer: 1001 });
  });

  it("update never sends a project, even when one was posted", async () => {
    execProc.mockResolvedValue([meetingDbRow()]);
    const input = updateMeetingFormSchema.parse({
      meetingId: "2",
      rowVer: "1001",
      subject: "Weekly progress",
      projectId: "99",
    });
    await updateMeeting(input, ACTOR);
    const [proc, params] = call();
    expect(proc).toBe("usp_Meeting_Update");
    expect(params).not.toHaveProperty("ProjectId");
    expect(params).toMatchObject({ MeetingId: 2, RowVer: 1001, Subject: "Weekly progress" });
  });

  it("get by id, delete, attendees and apologies pass the ids through", async () => {
    execProc.mockResolvedValueOnce([meetingDbRow()]);
    expect((await getMeetingById(2, ACTOR)).MeetingId).toBe(2);
    expect(call()).toEqual(["usp_Meeting_GetById", { MeetingId: 2, ActorUserId: ACTOR }]);

    execProc.mockResolvedValueOnce([]);
    await deleteMeeting(2, 1001, ACTOR);
    expect(call(1)).toEqual([
      "usp_Meeting_Delete",
      { MeetingId: 2, RowVer: 1001, ActorUserId: ACTOR },
    ]);

    const line = {
      MeetingParticipantId: 1,
      MeetingId: 2,
      StakeholderId: 3,
      Label: "Gary Cantrall",
    };
    execProc.mockResolvedValueOnce([line]);
    expect(await listAttendees(2, ACTOR)).toEqual([line]);
    expect(call(2)[0]).toBe("usp_Meeting_GetAttendees");
    execProc.mockResolvedValueOnce([]);
    expect(await listApologies(2, ACTOR)).toEqual([]);
    expect(call(3)).toEqual(["usp_Meeting_GetApologies", { MeetingId: 2, ActorUserId: ACTOR }]);
  });

  it("list forwards the list contract and the date filter", async () => {
    execProc.mockResolvedValue([meetingListDbRow()]);
    const rows = await listMeetings(
      24,
      listParamsSchema.parse({ q: "budget", sort: "Subject", dir: "desc", page: "2" }),
      ACTOR,
      { dateFrom: new Date("2024-12-01"), dateTo: new Date("2024-12-31") },
    );
    expect(call()).toEqual([
      "usp_Meeting_List",
      {
        ActorUserId: ACTOR,
        ProjectId: 24,
        Search: "budget",
        SortBy: "Subject",
        SortDir: "desc",
        Page: 2,
        PageSize: 25,
        DateFrom: new Date("2024-12-01"),
        DateTo: new Date("2024-12-31"),
      },
    ]);
    expect(rows[0]).toMatchObject({
      AttendeeCount: 2,
      ApologyCount: 1,
      ActorAccess: "Contributor",
    });
  });

  it("list without a project or filters sends nulls", async () => {
    execProc.mockResolvedValue([]);
    await listMeetings(null, listParamsSchema.parse({}), ACTOR);
    expect(call()[1]).toMatchObject({
      ProjectId: null,
      Search: null,
      DateFrom: null,
      DateTo: null,
    });
  });

  it("no repository call sends an actor role: the procs resolve it (ADR-0021)", async () => {
    execProc.mockResolvedValue([meetingListDbRow()]);
    await listMeetings(24, listParamsSchema.parse({}), ACTOR);
    answerWith(scopeDbRow());
    await createAgendaItem({ meetingId: 2, agendaItem: "A" }, ACTOR);
    for (const [, params] of execProc.mock.calls as [string, Record<string, unknown>][]) {
      expect(params).not.toHaveProperty("ActorRole");
    }
  });
});

describe("meetings repository: workspace", () => {
  it("splits the row into the meeting and its collections", async () => {
    execProc.mockResolvedValue([workspaceDbRow()]);
    const ws = await getMeetingWorkspace(2, ACTOR);
    expect(call()).toEqual(["usp_Meeting_GetWorkspace", { MeetingId: 2, ActorUserId: ACTOR }]);
    expect(ws.meeting).toMatchObject({
      MeetingId: 2,
      Subject: "Weekly progress",
      StartTime: "09:00",
    });
    expect(ws.meeting).not.toHaveProperty("AgendaItemsJson");
    expect(ws.agendaItems).toEqual([
      { MeetingAgendaItemId: 1, AgendaItem: "Budget", SortOrder: 1, RowVer: 2001 },
    ]);
    expect(ws.discussionPoints[0]).toMatchObject({
      AgendaItemId: 1,
      DiscussionPoint: "<p>Over by 5%</p>",
    });
    expect(ws.actionItems.map((a) => a.AssigneeName)).toEqual(["Gary Cantrall", null]);
    expect(ws.actionItems[0].DueDate).toBe("2024-12-20");
    expect(ws.participants[0]).toMatchObject({ StakeholderId: 3, IsApology: false });
    expect(ws.participantsStamp).toBe(2004);
    expect(ws.stamp).toBe(3000);
  });
});

describe("meetings repository: minutes and participants", () => {
  it("re-reads the meeting the proc reports, not the one the caller named", async () => {
    answerWith(scopeDbRow({ MeetingId: 9 }));
    const ws = await createAgendaItem({ meetingId: 2, agendaItem: "Budget" }, ACTOR);
    expect(call(0)).toEqual([
      "usp_MeetingAgendaItem_Create",
      { MeetingId: 2, AgendaItem: "Budget", ActorUserId: ACTOR },
    ]);
    expect(call(1)).toEqual(["usp_Meeting_GetWorkspace", { MeetingId: 9, ActorUserId: ACTOR }]);
    expect(ws?.agendaItems).toHaveLength(1);
  });

  it("answers null for a legacy row that belongs to no meeting", async () => {
    answerWith(scopeDbRow({ MeetingId: null, ProjectId: null }));
    expect(await deleteAgendaItem({ meetingAgendaItemId: 3, rowVer: 5 }, ACTOR)).toBeNull();
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("throws when a proc answers without its scope", async () => {
    execProc.mockResolvedValue([]);
    await expect(
      updateAgendaItem({ meetingAgendaItemId: 1, rowVer: 1, agendaItem: "A" }, ACTOR),
    ).rejects.toThrow();
  });

  it("child updates send no parent ids, even when they were posted", async () => {
    answerWith(scopeDbRow());
    await updateAgendaItem(
      updateAgendaItemSchema.parse({
        meetingAgendaItemId: "1",
        rowVer: "4",
        agendaItem: "A",
        meetingId: "8",
      }),
      ACTOR,
    );
    expect(call(0)).toEqual([
      "usp_MeetingAgendaItem_Update",
      { MeetingAgendaItemId: 1, AgendaItem: "A", RowVer: 4, ActorUserId: ACTOR },
    ]);
    await updateActionItem(
      updateActionItemSchema.parse({
        meetingActionItemId: "1",
        rowVer: "4",
        action: "Do it",
        discussionPointId: "8",
        agendaItemId: "8",
      }),
      ACTOR,
    );
    expect(call(2)).toEqual([
      "usp_MeetingActionItem_Update",
      {
        MeetingActionItemId: 1,
        Action: "Do it",
        AssignedToStakeholderId: null,
        DueDate: null,
        RowVer: 4,
        ActorUserId: ACTOR,
      },
    ]);
  });

  it.each([
    [
      "deleteDiscussionPoint",
      () => deleteDiscussionPoint({ meetingDiscussionPointId: 1, rowVer: 2 }, ACTOR),
      "usp_MeetingDiscussionPoint_Delete",
      { MeetingDiscussionPointId: 1, RowVer: 2 },
    ],
    [
      "createDiscussionPoint",
      () => createDiscussionPoint({ agendaItemId: 1, discussionPoint: "<p>P</p>" }, ACTOR),
      "usp_MeetingDiscussionPoint_Create",
      { AgendaItemId: 1, DiscussionPoint: "<p>P</p>" },
    ],
    [
      "updateDiscussionPoint",
      () =>
        updateDiscussionPoint(
          { meetingDiscussionPointId: 1, rowVer: 2, discussionPoint: "<p>P</p>" },
          ACTOR,
        ),
      "usp_MeetingDiscussionPoint_Update",
      { MeetingDiscussionPointId: 1, DiscussionPoint: "<p>P</p>", RowVer: 2 },
    ],
    [
      "createActionItem",
      () =>
        createActionItem(
          {
            discussionPointId: 1,
            agendaItemId: null,
            action: "Do it",
            assignedToStakeholderId: 3,
            dueDate: new Date("2024-12-20"),
          },
          ACTOR,
        ),
      "usp_MeetingActionItem_Create",
      {
        DiscussionPointId: 1,
        AgendaItemId: null,
        Action: "Do it",
        AssignedToStakeholderId: 3,
        DueDate: new Date("2024-12-20"),
      },
    ],
    [
      "deleteActionItem",
      () => deleteActionItem({ meetingActionItemId: 1, rowVer: 2 }, ACTOR),
      "usp_MeetingActionItem_Delete",
      { MeetingActionItemId: 1, RowVer: 2 },
    ],
    [
      "reorderAgendaItems",
      () =>
        reorderAgendaItems(
          {
            meetingId: 2,
            order: [
              { id: 2, rowVer: 5 },
              { id: 1, rowVer: 4 },
            ],
          },
          ACTOR,
        ),
      "usp_MeetingAgendaItem_Reorder",
      { MeetingId: 2, OrderJson: '[{"id":2,"rowVer":5},{"id":1,"rowVer":4}]' },
    ],
    [
      "reorderDiscussionPoints",
      () => reorderDiscussionPoints({ agendaItemId: 1, order: [{ id: 3, rowVer: 5 }] }, ACTOR),
      "usp_MeetingDiscussionPoint_Reorder",
      { AgendaItemId: 1, OrderJson: '[{"id":3,"rowVer":5}]' },
    ],
    [
      "reorderActionItems",
      () =>
        reorderActionItems(
          { discussionPointId: null, agendaItemId: 1, order: [{ id: 2, rowVer: 5 }] },
          ACTOR,
        ),
      "usp_MeetingActionItem_Reorder",
      { DiscussionPointId: null, AgendaItemId: 1, OrderJson: '[{"id":2,"rowVer":5}]' },
    ],
    [
      "setParticipants",
      () =>
        setParticipants(
          {
            meetingId: 2,
            stamp: 2004,
            participants: [
              { stakeholderId: 3, isApology: false },
              { stakeholderId: 4, isApology: true },
            ],
          },
          ACTOR,
        ),
      "usp_MeetingParticipant_Set",
      {
        MeetingId: 2,
        ParticipantsJson:
          '[{"stakeholderId":3,"isApology":false},{"stakeholderId":4,"isApology":true}]',
        Stamp: 2004,
      },
    ],
  ])("%s calls its proc and answers the workspace", async (_name, run, proc, params) => {
    answerWith(scopeDbRow());
    const ws = await run();
    expect(call(0)).toEqual([proc, { ...params, ActorUserId: ACTOR }]);
    expect(call(1)[0]).toBe("usp_Meeting_GetWorkspace");
    expect(ws?.meeting.MeetingId).toBe(2);
  });
});
