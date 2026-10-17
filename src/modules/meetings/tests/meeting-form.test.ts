import { describe, expect, it } from "vitest";
import "@/lib/rich-text/sanitize";
import { messages } from "@/lib/messages";
import { meetingRowSchema } from "../schemas/meeting";
import {
  MEETING_PARTICIPANTS_MAX,
  MEETING_REORDER_MAX,
  createActionItemSchema,
  createAgendaItemSchema,
  createDiscussionPointSchema,
  createMeetingDraftSchema,
  meetingFormSchema,
  meetingFormValues,
  reorderActionItemsSchema,
  reorderAgendaSchema,
  setParticipantsSchema,
  updateActionItemSchema,
  updateMeetingFormSchema,
} from "../schemas/meeting-form";
import { meetingDbRow } from "./fixtures";

const M = messages.meetings;

function issuesOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
}

describe("meetingFormSchema", () => {
  it("coerces FormData strings into the repository input shape", () => {
    const parsed = meetingFormSchema.parse({
      projectId: "24",
      subject: "  Weekly progress  ",
      objective: "<p>Review</p>",
      dateReceived: "2024-12-10",
      location: " Board room ",
      startDate: "2024-12-17",
      startTime: "09:00",
      endTime: "10:30",
      nextMeeting: "2024-12-24",
      followupAction: "",
    });
    expect(parsed).toMatchObject({
      projectId: 24,
      subject: "Weekly progress",
      objective: "<p>Review</p>",
      location: "Board room",
      startTime: "09:00",
      endTime: "10:30",
      followupAction: null,
      description: null,
      conclusion: null,
    });
    expect(parsed.dateReceived).toEqual(new Date("2024-12-10"));
    expect(parsed.startDate).toEqual(new Date("2024-12-17"));
    expect(parsed.nextMeeting).toEqual(new Date("2024-12-24"));
  });

  it("turns empty dates and times into null", () => {
    const parsed = meetingFormSchema.parse({
      projectId: "24",
      subject: "Draft",
      startDate: "",
      startTime: "",
      endTime: "",
    });
    expect(parsed.startDate).toBeNull();
    expect(parsed.startTime).toBeNull();
    expect(parsed.endTime).toBeNull();
  });

  it("asks for a title", () => {
    const result = meetingFormSchema.safeParse({ projectId: "24", subject: "   " });
    expect(issuesOf(result).subject).toBe(M.titleRequired);
    expect(issuesOf(meetingFormSchema.safeParse({ projectId: "24" })).subject).toBe(
      M.titleRequired,
    );
  });

  it("rejects a malformed time and a malformed date", () => {
    const issues = issuesOf(
      meetingFormSchema.safeParse({
        projectId: "24",
        subject: "S",
        startTime: "9am",
        endTime: "24:00",
        startDate: "not-a-date",
      }),
    );
    expect(issues.startTime).toBe(M.invalidTime);
    expect(issues.endTime).toBe(M.invalidTime);
    expect(issues.startDate).toBe(messages.errors.VALIDATION);
  });

  it.each([
    ["10:00", "09:30"],
    ["10:00", "10:00"],
  ])("puts the issue on endTime when it is not after the start (%s → %s)", (start, end) => {
    const issues = issuesOf(
      meetingFormSchema.safeParse({
        projectId: "24",
        subject: "S",
        startTime: start,
        endTime: end,
      }),
    );
    expect(issues).toEqual({ endTime: M.endAfterStart });
  });

  it("allows one time without the other", () => {
    expect(
      meetingFormSchema.safeParse({ projectId: "24", subject: "S", endTime: "10:00" }).success,
    ).toBe(true);
  });

  it("sanitises the rich-text fields and stores an empty editor as null", () => {
    const parsed = meetingFormSchema.parse({
      projectId: "24",
      subject: "S",
      objective: '<p onclick="x()">Hi<script>alert(1)</script></p>',
      description: "<p></p>",
      conclusion: '<p><a href="javascript:alert(1)">link</a></p>',
    });
    expect(parsed.objective).toBe("<p>Hi</p>");
    expect(parsed.description).toBeNull();
    expect(parsed.conclusion).not.toContain("javascript:");
  });

  it("caps the plain fields", () => {
    const issues = issuesOf(
      meetingFormSchema.safeParse({
        projectId: "24",
        subject: "x".repeat(256),
        location: "x".repeat(256),
      }),
    );
    expect(Object.keys(issues).sort()).toEqual(["location", "subject"]);
  });
});

describe("updateMeetingFormSchema", () => {
  it("needs no project, so a project-less legacy meeting stays editable", () => {
    const parsed = updateMeetingFormSchema.parse({ meetingId: "5", rowVer: "77", subject: "S" });
    expect(parsed).toMatchObject({ meetingId: 5, rowVer: 77, subject: "S" });
    expect("projectId" in parsed).toBe(false);
  });

  it("drops a project sent anyway", () => {
    const parsed = updateMeetingFormSchema.parse({
      meetingId: "5",
      rowVer: "77",
      subject: "S",
      projectId: "99",
    });
    expect("projectId" in parsed).toBe(false);
  });

  it("checks the times too", () => {
    const issues = issuesOf(
      updateMeetingFormSchema.safeParse({
        meetingId: "5",
        rowVer: "1",
        subject: "S",
        startTime: "11:00",
        endTime: "10:00",
      }),
    );
    expect(issues).toEqual({ endTime: M.endAfterStart });
  });
});

describe("createMeetingDraftSchema", () => {
  it("needs only the project", () => {
    expect(createMeetingDraftSchema.parse({ projectId: "24" })).toEqual({ projectId: 24 });
    expect(createMeetingDraftSchema.safeParse({}).success).toBe(false);
  });
});

describe("meetingFormValues", () => {
  it("is what a datasheet cell edit sends back", () => {
    const values = meetingFormValues(meetingRowSchema.parse(meetingDbRow()));
    expect(values).toMatchObject({
      meetingId: "2",
      rowVer: "1001",
      subject: "Weekly progress",
      startDate: "2024-12-17",
      startTime: "09:00",
      endTime: "10:30",
      dateReceived: "",
      location: "Board room",
    });
    expect(updateMeetingFormSchema.safeParse(values).success).toBe(true);
  });

  it("reads the legacy 00:00–00:00 pair as no times", () => {
    const row = meetingRowSchema.parse(
      meetingDbRow({
        StartTime: new Date("1970-01-01T00:00:00Z"),
        EndTime: new Date("1970-01-01T00:00:00Z"),
      }),
    );
    const values = meetingFormValues(row);
    expect(values.startTime).toBe("");
    expect(values.endTime).toBe("");
    expect(updateMeetingFormSchema.safeParse(values).success).toBe(true);
  });

  it("keeps a real midnight start that has a later end", () => {
    const row = meetingRowSchema.parse(
      meetingDbRow({ StartTime: new Date("1970-01-01T00:00:00Z") }),
    );
    expect(meetingFormValues(row).startTime).toBe("00:00");
  });
});

describe("minutes schemas", () => {
  it("agenda items are plain text and required", () => {
    expect(createAgendaItemSchema.parse({ meetingId: "2", agendaItem: " Budget " })).toEqual({
      meetingId: 2,
      agendaItem: "Budget",
    });
    expect(issuesOf(createAgendaItemSchema.safeParse({ meetingId: "2", agendaItem: " " }))).toEqual(
      {
        agendaItem: M.agendaItemRequired,
      },
    );
  });

  it("discussion points are sanitised rich text and required", () => {
    expect(
      createDiscussionPointSchema.parse({
        agendaItemId: "1",
        discussionPoint: "<p>A<img src=x></p>",
      }).discussionPoint,
    ).toBe("<p>A</p>");
    expect(
      issuesOf(
        createDiscussionPointSchema.safeParse({ agendaItemId: "1", discussionPoint: "<p></p>" }),
      ).discussionPoint,
    ).toBe(M.discussionPointRequired);
  });

  it("an action needs a discussion point or an agenda item", () => {
    expect(issuesOf(createActionItemSchema.safeParse({ action: "Do it" }))).toEqual({
      agendaItemId: M.actionParentRequired,
    });
    const parsed = createActionItemSchema.parse({
      discussionPointId: "4",
      agendaItemId: "",
      action: "Do it",
      assignedToStakeholderId: "",
      dueDate: "2024-12-20",
    });
    expect(parsed).toMatchObject({
      discussionPointId: 4,
      agendaItemId: null,
      assignedToStakeholderId: null,
    });
    expect(parsed.dueDate).toEqual(new Date("2024-12-20"));
  });

  it("an action update carries no parent", () => {
    const parsed = updateActionItemSchema.parse({
      meetingActionItemId: "1",
      rowVer: "3",
      action: "Do it",
      discussionPointId: "9",
      agendaItemId: "9",
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "action",
      "assignedToStakeholderId",
      "dueDate",
      "meetingActionItemId",
      "rowVer",
    ]);
  });
});

describe("reorder schemas", () => {
  const order = [
    { id: 2, rowVer: 11 },
    { id: 1, rowVer: 10 },
  ];

  it("accepts every sibling once", () => {
    expect(reorderAgendaSchema.parse({ meetingId: 2, order }).order).toEqual(order);
  });

  it("refuses a repeated id and an oversized list", () => {
    expect(
      reorderAgendaSchema.safeParse({ meetingId: 2, order: [order[0], order[0]] }).success,
    ).toBe(false);
    const many = Array.from({ length: MEETING_REORDER_MAX + 1 }, (_, i) => ({
      id: i + 1,
      rowVer: 1,
    }));
    expect(reorderAgendaSchema.safeParse({ meetingId: 2, order: many }).success).toBe(false);
  });

  it("action reorders name exactly one parent", () => {
    expect(reorderActionItemsSchema.safeParse({ discussionPointId: 1, order }).success).toBe(true);
    expect(reorderActionItemsSchema.safeParse({ agendaItemId: 1, order }).success).toBe(true);
    expect(reorderActionItemsSchema.safeParse({ order }).success).toBe(false);
    expect(
      reorderActionItemsSchema.safeParse({ discussionPointId: 1, agendaItemId: 1, order }).success,
    ).toBe(false);
  });
});

describe("setParticipantsSchema", () => {
  it("accepts attendees and apologies with the stamp read", () => {
    const parsed = setParticipantsSchema.parse({
      meetingId: 2,
      stamp: "2004",
      participants: [
        { stakeholderId: 3, isApology: false, label: "dropped" },
        { stakeholderId: 4, isApology: true },
      ],
    });
    expect(parsed.stamp).toBe(2004);
    expect(parsed.participants).toEqual([
      { stakeholderId: 3, isApology: false },
      { stakeholderId: 4, isApology: true },
    ]);
  });

  it("refuses a repeated stakeholder, a non-boolean flag and an oversized list", () => {
    const base = { meetingId: 2, stamp: 1 };
    expect(
      setParticipantsSchema.safeParse({
        ...base,
        participants: [
          { stakeholderId: 3, isApology: false },
          { stakeholderId: 3, isApology: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      setParticipantsSchema.safeParse({
        ...base,
        participants: [{ stakeholderId: 3, isApology: "yes" }],
      }).success,
    ).toBe(false);
    const many = Array.from({ length: MEETING_PARTICIPANTS_MAX + 1 }, (_, i) => ({
      stakeholderId: i + 1,
      isApology: false,
    }));
    expect(setParticipantsSchema.safeParse({ ...base, participants: many }).success).toBe(false);
  });
});
