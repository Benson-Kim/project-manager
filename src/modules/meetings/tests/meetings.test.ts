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
  createFollowUp,
  createMeeting,
  createMeetingDraft,
  deleteActionItem,
  deleteAgendaItem,
  deleteDiscussionPoint,
  deleteFollowUp,
  deleteMeeting,
  getMeetingById,
  getMeetingRoster,
  getMeetingWorkspace,
  listApologies,
  listAttendees,
  listMeetings,
  reorderActionItems,
  reorderAgendaItems,
  reorderDiscussionPoints,
  reorderFollowUps,
  setActionItemStatus,
  setParticipants,
  updateActionItem,
  updateAgendaItem,
  updateDiscussionPoint,
  updateFollowUp,
  updateMeeting,
} from "../repository/meetings";
import {
  meetingRosterRowSchema,
  meetingWorkspaceRowSchema,
  timeOfDaySchema,
} from "../schemas/meeting";
import {
  meetingFormSchema,
  updateActionItemSchema,
  updateAgendaItemSchema,
  updateFollowUpSchema,
  updateMeetingFormSchema,
} from "../schemas/meeting-form";
import {
  meetingDbRow,
  meetingListDbRow,
  rosterDbRow,
  scopeDbRow,
  workspaceDbRow,
} from "./fixtures";

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
    expect(Object.keys(params)).toHaveLength(12);
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
    execProc.mockResolvedValue([rosterDbRow()]);
    await getMeetingRoster(2, ACTOR);
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

describe("meetings repository: participant roster", () => {
  it("returns the people and the stamp they were read with", async () => {
    execProc.mockResolvedValue([rosterDbRow()]);
    const roster = await getMeetingRoster(2, ACTOR);
    expect(call()).toEqual(["usp_Meeting_GetRoster", { MeetingId: 2, ActorUserId: ACTOR }]);
    expect(roster.stamp).toBe(2004);
    expect(roster.entries.map((e) => [e.StakeholderId, e.IsApology, e.IsHistorical])).toEqual([
      [3, false, false],
      [4, null, false],
      [9, true, true],
    ]);
  });

  it("reads a project with no stakeholders (FOR JSON gives NULL) as an empty roster", async () => {
    execProc.mockResolvedValue([rosterDbRow({ RosterJson: null, ParticipantsStamp: "0" })]);
    expect(await getMeetingRoster(2, ACTOR)).toEqual({ entries: [], stamp: 0 });
  });

  it("refuses a person with a missing key and drops columns it does not know", () => {
    const missing = JSON.stringify([{ StakeholderId: 3, Label: "A", IsHistorical: false }]);
    expect(meetingRosterRowSchema.safeParse(rosterDbRow({ RosterJson: missing })).success).toBe(
      false,
    );
    const extra = JSON.stringify([
      {
        StakeholderId: 3,
        Label: "A",
        MeetingParticipantId: null,
        IsApology: null,
        IsHistorical: false,
        GuestName: null,
        GuestOrganization: null,
        EmailAddress: "a@example.com",
      },
    ]);
    const parsed = meetingRosterRowSchema.parse(rosterDbRow({ RosterJson: extra }));
    expect(parsed.RosterJson[0]).not.toHaveProperty("EmailAddress");
  });

  it("throws when the proc answers no row", async () => {
    execProc.mockResolvedValue([]);
    await expect(getMeetingRoster(2, ACTOR)).rejects.toThrow();
  });
});

describe("meetings repository: rich text leaves sanitised (ADR-0025)", () => {
  const legacy = {
    Objective: '<div><font face="Arial">Plan</font><script>alert(1)</script></div>',
    Description: '<p onclick="x()">Notes</p>',
    Conclusion: "<p></p>",
  };

  it("converts legacy markup and strips scripts on every meeting read", async () => {
    execProc.mockResolvedValue([meetingListDbRow(legacy)]);
    const [listed] = await listMeetings(24, listParamsSchema.parse({}), ACTOR);
    expect(listed.Objective).toBe('<p><span style="font-family:Arial">Plan</span></p>');
    expect(listed.Description).toBe("<p>Notes</p>");
    expect(listed.Conclusion).toBe("<p></p>");
    expect(listed.AttendeeCount).toBe(2);

    execProc.mockResolvedValue([meetingDbRow(legacy)]);
    expect((await getMeetingById(2, ACTOR)).Objective).not.toContain("script");
    expect((await createMeetingDraft(24, ACTOR)).Description).toBe("<p>Notes</p>");
  });

  it("sanitises the workspace's meeting and discussion points", async () => {
    execProc.mockResolvedValue([
      workspaceDbRow({
        ...legacy,
        DiscussionPointsJson: JSON.stringify([
          {
            MeetingDiscussionPointId: 1,
            AgendaItemId: 1,
            DiscussionPoint: '<p>Agreed<img src=x onerror="alert(1)"></p>',
            SortOrder: 1,
            RowVer: 2002,
          },
        ]),
      }),
    ]);
    const ws = await getMeetingWorkspace(2, ACTOR);
    expect(ws.meeting.Description).toBe("<p>Notes</p>");
    expect(ws.discussionPoints[0].DiscussionPoint).toBe("<p>Agreed</p>");
  });

  it("keeps empty fields empty", async () => {
    execProc.mockResolvedValue([meetingDbRow({ Objective: null, Description: "" })]);
    const row = await getMeetingById(2, ACTOR);
    expect(row.Objective).toBeNull();
    expect(row.Description).toBe("");
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
        Status: "in-progress",
        OnHoldReason: null,
        RowVer: 4,
        ActorUserId: ACTOR,
      },
    ]);
    await updateFollowUp(
      updateFollowUpSchema.parse({
        meetingActionFollowUpId: "1",
        rowVer: "4",
        followUp: "Chased",
        meetingActionItemId: "8",
      }),
      ACTOR,
    );
    expect(call(4)).toEqual([
      "usp_MeetingActionFollowUp_Update",
      {
        MeetingActionFollowUpId: 1,
        FollowUp: "Chased",
        AssignedToStakeholderId: null,
        FollowUpDate: null,
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
            status: "on-hold",
            onHoldReason: "Waiting on the supplier",
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
        Status: "on-hold",
        OnHoldReason: "Waiting on the supplier",
      },
    ],
    [
      "setActionItemStatus",
      () =>
        setActionItemStatus(
          { meetingActionItemId: 1, rowVer: 4, status: "completed", onHoldReason: null },
          ACTOR,
        ),
      "usp_MeetingActionItem_SetStatus",
      { MeetingActionItemId: 1, Status: "completed", OnHoldReason: null, RowVer: 4 },
    ],
    [
      "createFollowUp",
      () =>
        createFollowUp(
          {
            meetingActionItemId: 1,
            followUp: "Chased the supplier",
            assignedToStakeholderId: 3,
            followUpDate: new Date("2024-12-18"),
            dueDate: new Date("2024-12-20"),
          },
          ACTOR,
        ),
      "usp_MeetingActionFollowUp_Create",
      {
        MeetingActionItemId: 1,
        FollowUp: "Chased the supplier",
        AssignedToStakeholderId: 3,
        FollowUpDate: new Date("2024-12-18"),
        DueDate: new Date("2024-12-20"),
      },
    ],
    [
      "deleteFollowUp",
      () => deleteFollowUp({ meetingActionFollowUpId: 1, rowVer: 2 }, ACTOR),
      "usp_MeetingActionFollowUp_Delete",
      { MeetingActionFollowUpId: 1, RowVer: 2 },
    ],
    [
      "reorderFollowUps",
      () => reorderFollowUps({ meetingActionItemId: 1, order: [{ id: 3, rowVer: 5 }] }, ACTOR),
      "usp_MeetingActionFollowUp_Reorder",
      { MeetingActionItemId: 1, OrderJson: '[{"id":3,"rowVer":5}]' },
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
