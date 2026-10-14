/** Rows as the driver returns them: RowVer as a BIGINT string, TIME(0) as a 1970-01-01 UTC Date. */

export function meetingDbRow(overrides: Record<string, unknown> = {}) {
  return {
    MeetingId: 2,
    ProjectId: 24,
    Subject: "Weekly progress",
    Objective: "<p>Review the <strong>budget</strong></p>",
    DateReceived: null,
    Description: null,
    Location: "Board room",
    StartDate: new Date("2024-12-17T00:00:00Z"),
    StartTime: new Date("1970-01-01T09:00:00Z"),
    EndTime: new Date("1970-01-01T10:30:00Z"),
    Conclusion: null,
    NextMeeting: null,
    FollowupAction: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "1001",
    ...overrides,
  };
}

export function meetingListDbRow(overrides: Record<string, unknown> = {}) {
  return {
    ...meetingDbRow(),
    AttendeeCount: 2,
    ApologyCount: 1,
    ActorAccess: "Contributor",
    ActorGrants: null,
    ActorRevokes: null,
    TotalCount: 1,
    ...overrides,
  };
}

/** One usp_Meeting_GetWorkspace row: FOR JSON columns are strings, BIT is a JSON boolean. */
export function workspaceDbRow(overrides: Record<string, unknown> = {}) {
  return {
    ...meetingDbRow(),
    AgendaItemsJson: JSON.stringify([
      { MeetingAgendaItemId: 1, AgendaItem: "Budget", SortOrder: 1, RowVer: 2001 },
    ]),
    DiscussionPointsJson: JSON.stringify([
      {
        MeetingDiscussionPointId: 1,
        AgendaItemId: 1,
        DiscussionPoint: "<p>Over by 5%</p>",
        SortOrder: 1,
        RowVer: 2002,
      },
    ]),
    ActionItemsJson: JSON.stringify([
      {
        MeetingActionItemId: 1,
        AgendaItemId: 1,
        DiscussionPointId: 1,
        Action: "Send the revised budget",
        AssignedToStakeholderId: 3,
        AssigneeName: "Gary Cantrall",
        DueDate: "2024-12-20",
        SortOrder: 1,
        RowVer: 2003,
      },
      {
        MeetingActionItemId: 2,
        AgendaItemId: 1,
        DiscussionPointId: null,
        Action: "Book the next room",
        AssignedToStakeholderId: null,
        AssigneeName: null,
        DueDate: null,
        SortOrder: 1,
        RowVer: 2005,
      },
    ]),
    ParticipantsJson: JSON.stringify([
      {
        MeetingParticipantId: 1,
        StakeholderId: 3,
        Label: "Gary Cantrall - Software Engineer, Organization and efficiency",
        IsApology: false,
        StakeholderIsDeleted: false,
        RowVer: 2004,
      },
    ]),
    ParticipantsStamp: "2004",
    Stamp: "3000",
    ...overrides,
  };
}

/** What child mutations answer: the row's project and meeting. */
export function scopeDbRow(overrides: Record<string, unknown> = {}) {
  return { ProjectId: 24, MeetingId: 2, ...overrides };
}

/** One usp_Meeting_GetRoster row: the stamp and the people as a FOR JSON string. */
export function rosterDbRow(overrides: Record<string, unknown> = {}) {
  return {
    ProjectId: 24,
    MeetingId: 2,
    ParticipantsStamp: "2004",
    RosterJson: JSON.stringify([
      {
        StakeholderId: 3,
        Label: "Gary Cantrall - Software Engineer, Organization and efficiency",
        MeetingParticipantId: 1,
        IsApology: false,
        IsHistorical: false,
      },
      {
        StakeholderId: 4,
        Label: "Lucy Taylor",
        MeetingParticipantId: null,
        IsApology: null,
        IsHistorical: false,
      },
      {
        StakeholderId: 9,
        Label: "Tome Green",
        MeetingParticipantId: 5,
        IsApology: true,
        IsHistorical: true,
      },
    ]),
    ...overrides,
  };
}
