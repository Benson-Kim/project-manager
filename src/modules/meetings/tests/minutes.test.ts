import { describe, expect, it } from "vitest";
import type {
  CarriedOverAction,
  RosterEntry,
  WorkspaceActionItem,
  WorkspaceAgendaItem,
  WorkspaceDiscussionPoint,
  WorkspaceFollowUp,
} from "../schemas/meeting";
import {
  reorderActionItemsSchema,
  reorderAgendaSchema,
  reorderFollowUpsSchema,
} from "../schemas/meeting-form";
import {
  actionSiblings,
  agendaSiblings,
  buildMinutes,
  carriedOverActions,
  editRowVer,
  followUpSiblings,
  isOverdue,
  itemName,
  moveOrder,
  openActions,
  personOptions,
  pointSiblings,
  sameAction,
  sameAgendaItem,
  sameFollowUp,
  samePoint,
  todayIso,
} from "../schemas/minutes";

function agenda(id: number, sort: number, text = `Item ${id}`): WorkspaceAgendaItem {
  return { MeetingAgendaItemId: id, AgendaItem: text, SortOrder: sort, RowVer: 100 + id };
}

function point(id: number, agendaId: number, sort: number): WorkspaceDiscussionPoint {
  return {
    MeetingDiscussionPointId: id,
    AgendaItemId: agendaId,
    DiscussionPoint: `<p>Point ${id}</p>`,
    SortOrder: sort,
    RowVer: 200 + id,
  };
}

function action(
  id: number,
  parent: { agendaId: number; pointId?: number },
  sort: number,
  overrides: Partial<WorkspaceActionItem> = {},
): WorkspaceActionItem {
  return {
    MeetingActionItemId: id,
    AgendaItemId: parent.agendaId,
    DiscussionPointId: parent.pointId ?? null,
    Action: `Action ${id}`,
    AssignedToStakeholderId: null,
    AssigneeName: null,
    DueDate: null,
    Status: "in-progress",
    OnHoldReason: null,
    SortOrder: sort,
    RowVer: 300 + id,
    ...overrides,
  };
}

function followUp(
  id: number,
  actionId: number,
  sort: number,
  overrides: Partial<WorkspaceFollowUp> = {},
): WorkspaceFollowUp {
  return {
    MeetingActionFollowUpId: id,
    MeetingActionItemId: actionId,
    FollowUp: `Follow-up ${id}`,
    AssignedToStakeholderId: null,
    AssigneeName: null,
    FollowUpDate: null,
    DueDate: null,
    SortOrder: sort,
    RowVer: 400 + id,
    ...overrides,
  };
}

function carried(
  id: number,
  fromMeetingId: number,
  overrides: Partial<CarriedOverAction> = {},
): CarriedOverAction {
  return {
    MeetingActionItemId: id,
    Action: `Action ${id}`,
    Status: "in-progress",
    OnHoldReason: null,
    AssignedToStakeholderId: null,
    AssigneeName: null,
    DueDate: null,
    RowVer: 500 + id,
    FromMeetingId: fromMeetingId,
    FromSubject: `Meeting ${fromMeetingId}`,
    FromStartDate: "2026-10-01",
    ...overrides,
  };
}

describe("buildMinutes", () => {
  const tree = buildMinutes({
    agendaItems: [agenda(2, 2), agenda(1, 1), agenda(3, 2)],
    discussionPoints: [point(11, 1, 2), point(10, 1, 1), point(12, 2, 1), point(99, 404, 1)],
    actionItems: [
      action(21, { agendaId: 1, pointId: 10 }, 2),
      action(20, { agendaId: 1, pointId: 10 }, 1),
      action(22, { agendaId: 1 }, 1),
      action(23, { agendaId: 2, pointId: 12 }, 1),
      action(24, { agendaId: 1, pointId: 99 }, 1),
      action(25, { agendaId: 404 }, 1),
    ],
    followUps: [
      followUp(31, 20, 2),
      followUp(30, 20, 1),
      followUp(32, 22, 1),
      followUp(33, 24, 1),
      followUp(34, 404, 1),
    ],
  });

  it("orders the agenda by position, then id", () => {
    expect(tree.map((n) => n.item.MeetingAgendaItemId)).toEqual([1, 2, 3]);
  });

  it("puts each discussion point under its agenda item, in order", () => {
    expect(tree[0]!.points.map((p) => p.point.MeetingDiscussionPointId)).toEqual([10, 11]);
    expect(tree[1]!.points.map((p) => p.point.MeetingDiscussionPointId)).toEqual([12]);
    expect(tree[2]!.points).toEqual([]);
  });

  it("puts actions under their discussion point, or directly under the agenda item", () => {
    expect(tree[0]!.points[0]!.actions.map((a) => a.action.MeetingActionItemId)).toEqual([20, 21]);
    expect(tree[0]!.actions.map((a) => a.action.MeetingActionItemId)).toEqual([22]);
    expect(tree[1]!.points[0]!.actions.map((a) => a.action.MeetingActionItemId)).toEqual([23]);
  });

  it("puts each follow-up under its action, in order", () => {
    expect(tree[0]!.points[0]!.actions[0]!.followUps.map((f) => f.MeetingActionFollowUpId)).toEqual(
      [30, 31],
    );
    expect(tree[0]!.points[0]!.actions[1]!.followUps).toEqual([]);
    expect(tree[0]!.actions[0]!.followUps.map((f) => f.MeetingActionFollowUpId)).toEqual([32]);
  });

  it("leaves out children whose parent the workspace does not hold", () => {
    const actions = tree.flatMap((n) => [...n.points.flatMap((p) => p.actions), ...n.actions]);
    const ids = [
      ...tree.flatMap((n) => n.points.map((p) => p.point.MeetingDiscussionPointId)),
      ...actions.map((a) => a.action.MeetingActionItemId),
    ];
    expect(ids).not.toContain(99);
    expect(ids).not.toContain(24);
    expect(ids).not.toContain(25);
    // 33 hangs off action 24, which was dropped; 34 off an action that is not here at all.
    const followUpIds = actions.flatMap((a) => a.followUps.map((u) => u.MeetingActionFollowUpId));
    expect(followUpIds).not.toContain(33);
    expect(followUpIds).not.toContain(34);
  });

  it("handles an empty meeting", () => {
    expect(
      buildMinutes({ agendaItems: [], discussionPoints: [], actionItems: [], followUps: [] }),
    ).toEqual([]);
  });
});

describe("moveOrder", () => {
  const siblings = [
    { id: 1, rowVer: 11 },
    { id: 2, rowVer: 12 },
    { id: 3, rowVer: 13 },
  ];

  it("swaps an item with the one above or below, keeping every RowVer", () => {
    expect(moveOrder(siblings, 2, -1)).toEqual([
      { id: 2, rowVer: 12 },
      { id: 1, rowVer: 11 },
      { id: 3, rowVer: 13 },
    ]);
    expect(moveOrder(siblings, 2, 1)).toEqual([
      { id: 1, rowVer: 11 },
      { id: 3, rowVer: 13 },
      { id: 2, rowVer: 12 },
    ]);
  });

  it("is null at either end or for an unknown item", () => {
    expect(moveOrder(siblings, 1, -1)).toBeNull();
    expect(moveOrder(siblings, 3, 1)).toBeNull();
    expect(moveOrder(siblings, 9, 1)).toBeNull();
    expect(moveOrder([], 1, 1)).toBeNull();
  });

  it("does not change the siblings it was given", () => {
    moveOrder(siblings, 1, 1);
    expect(siblings.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("builds payloads the reorder schemas accept", () => {
    const tree = buildMinutes({
      agendaItems: [agenda(1, 1), agenda(2, 2)],
      discussionPoints: [point(10, 1, 1), point(11, 1, 2)],
      actionItems: [action(20, { agendaId: 1 }, 1), action(21, { agendaId: 1 }, 2)],
      followUps: [followUp(30, 20, 1), followUp(31, 20, 2)],
    });
    const order = moveOrder(agendaSiblings(tree), 2, -1)!;
    expect(reorderAgendaSchema.safeParse({ meetingId: 5, order }).success).toBe(true);
    expect(pointSiblings(tree[0]!.points)).toEqual([
      { id: 10, rowVer: 210 },
      { id: 11, rowVer: 211 },
    ]);
    const actions = moveOrder(actionSiblings(tree[0]!.actions), 21, -1)!;
    expect(
      reorderActionItemsSchema.safeParse({ agendaItemId: 1, discussionPointId: "", order: actions })
        .success,
    ).toBe(true);
    const followUps = moveOrder(followUpSiblings(tree[0]!.actions[0]!.followUps), 31, -1)!;
    expect(followUps.map((s) => s.id)).toEqual([31, 30]);
    expect(
      reorderFollowUpsSchema.safeParse({ meetingActionItemId: 20, order: followUps }).success,
    ).toBe(true);
  });
});

describe("open and overdue actions", () => {
  it("reads today on the local calendar", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(todayIso(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });

  it("is overdue only once the due date has passed", () => {
    expect(isOverdue("2026-10-14", "2026-10-15")).toBe(true);
    expect(isOverdue("2026-10-15", "2026-10-15")).toBe(false);
    expect(isOverdue("2026-10-16", "2026-10-15")).toBe(false);
    expect(isOverdue(null, "2026-10-15")).toBe(false);
  });

  it("lists every action by due date, undated last, and marks the overdue ones", () => {
    const list = openActions(
      [
        action(1, { agendaId: 1 }, 1),
        action(2, { agendaId: 1 }, 2, { DueDate: "2026-10-20" }),
        action(3, { agendaId: 1 }, 3, { DueDate: "2026-10-01" }),
        action(4, { agendaId: 1 }, 4, { DueDate: "2026-10-20" }),
        action(5, { agendaId: 1 }, 5),
      ],
      "2026-10-15",
    );
    expect(list.map((o) => o.action.MeetingActionItemId)).toEqual([3, 2, 4, 1, 5]);
    expect(list.map((o) => o.overdue)).toEqual([true, false, false, false, false]);
  });

  it("drops a completed action but keeps one on hold (ADR-0041)", () => {
    const list = openActions(
      [
        action(1, { agendaId: 1 }, 1, { Status: "completed" }),
        action(2, { agendaId: 1 }, 2, { Status: "on-hold" }),
        action(3, { agendaId: 1 }, 3, { Status: "in-progress" }),
      ],
      "2026-10-15",
    );
    expect(list.map((o) => o.action.MeetingActionItemId)).toEqual([2, 3]);
  });

  it("does not reorder the actions it was given", () => {
    const given = [
      action(2, { agendaId: 1 }, 1, { DueDate: "2026-10-20" }),
      action(1, { agendaId: 1 }, 2, { DueDate: "2026-10-01" }),
    ];
    openActions(given, "2026-10-15");
    expect(given.map((a) => a.MeetingActionItemId)).toEqual([2, 1]);
  });
});

describe("carriedOverActions", () => {
  it("orders by due date, undated last, and marks the overdue ones", () => {
    const list = carriedOverActions(
      [
        carried(1, 7),
        carried(2, 7, { DueDate: "2026-10-20" }),
        carried(3, 8, { DueDate: "2026-10-01" }),
      ],
      "2026-10-15",
    );
    expect(list.map((c) => c.action.MeetingActionItemId)).toEqual([3, 2, 1]);
    expect(list.map((c) => c.overdue)).toEqual([true, false, false]);
  });

  it("drops anything that reads as completed, so the list never contradicts the status", () => {
    const list = carriedOverActions(
      [carried(1, 7, { Status: "completed" }), carried(2, 7, { Status: "on-hold" })],
      "2026-10-15",
    );
    expect(list.map((c) => c.action.MeetingActionItemId)).toEqual([2]);
  });

  it("is empty when nothing carries over", () => {
    expect(carriedOverActions([], "2026-10-15")).toEqual([]);
  });
});

describe("personOptions", () => {
  const roster: RosterEntry[] = [
    {
      StakeholderId: 3,
      Label: "Gary Cantrall - Developer, Org",
      MeetingParticipantId: 1,
      IsApology: false,
      GuestName: null,
      GuestOrganization: null,
      IsHistorical: false,
    },
    {
      StakeholderId: 4,
      Label: "Lucy Taylor",
      MeetingParticipantId: null,
      IsApology: null,
      GuestName: null,
      GuestOrganization: null,
      IsHistorical: false,
    },
    {
      StakeholderId: 9,
      Label: "Tome Green",
      MeetingParticipantId: 5,
      IsApology: true,
      GuestName: null,
      GuestOrganization: null,
      IsHistorical: true,
    },
    {
      StakeholderId: null,
      Label: "Ada Lovelace - Analytical Engines",
      MeetingParticipantId: 6,
      IsApology: false,
      IsHistorical: false,
      GuestName: "Ada Lovelace",
      GuestOrganization: "Analytical Engines",
    },
  ];

  it("offers the project's live stakeholders, labelled as on the roster, and no guest", () => {
    expect(personOptions(roster)).toEqual([
      { stakeholderId: 3, name: "Gary Cantrall - Developer, Org" },
      { stakeholderId: 4, name: "Lucy Taylor" },
    ]);
  });

  it("keeps a current person responsible who is no longer a live stakeholder", () => {
    expect(personOptions(roster, { id: 9, name: "Tome Green" }).at(-1)).toEqual({
      stakeholderId: 9,
      name: "Tome Green",
    });
    expect(personOptions(roster, { id: 77, name: null }).at(-1)).toEqual({
      stakeholderId: 77,
      name: "77",
    });
  });

  it("adds nobody for a live or empty person responsible", () => {
    expect(personOptions(roster, { id: 3, name: "Gary Cantrall" })).toHaveLength(2);
    expect(personOptions(roster, { id: null, name: null })).toHaveLength(2);
  });
});

describe("editRowVer", () => {
  it("moves to the newer RowVer when only the position changed", () => {
    const started = agenda(1, 1, "Budget");
    const reordered = { ...agenda(1, 2, "Budget"), RowVer: 999 };
    expect(editRowVer(started, reordered, sameAgendaItem)).toBe(999);
  });

  it("keeps the RowVer it started from when someone changed the fields", () => {
    const started = agenda(1, 1, "Budget");
    const renamed = { ...agenda(1, 1, "Costs"), RowVer: 999 };
    expect(editRowVer(started, renamed, sameAgendaItem)).toBe(101);
  });

  it("keeps the RowVer it started from when the item is gone", () => {
    expect(editRowVer(agenda(1, 1), undefined, sameAgendaItem)).toBe(101);
  });

  it("compares the text of a discussion point", () => {
    const a = point(1, 1, 1);
    expect(samePoint(a, { ...a, SortOrder: 5 })).toBe(true);
    expect(samePoint(a, { ...a, DiscussionPoint: "<p>Other</p>" })).toBe(false);
  });

  it("compares an action's text, person responsible, due date and status", () => {
    const a = action(1, { agendaId: 1 }, 1, { AssignedToStakeholderId: 3, DueDate: "2026-10-20" });
    expect(sameAction(a, { ...a, SortOrder: 9, RowVer: 1 })).toBe(true);
    expect(sameAction(a, { ...a, Action: "Other" })).toBe(false);
    expect(sameAction(a, { ...a, AssignedToStakeholderId: 4 })).toBe(false);
    expect(sameAction(a, { ...a, DueDate: null })).toBe(false);
    expect(sameAction(a, { ...a, Status: "completed" })).toBe(false);
  });

  it("compares a follow-up's text, person assigned and both dates", () => {
    const f = followUp(1, 20, 1, {
      AssignedToStakeholderId: 3,
      FollowUpDate: "2026-10-10",
      DueDate: "2026-10-20",
    });
    expect(sameFollowUp(f, { ...f, SortOrder: 9, RowVer: 1 })).toBe(true);
    expect(sameFollowUp(f, { ...f, FollowUp: "Other" })).toBe(false);
    expect(sameFollowUp(f, { ...f, AssignedToStakeholderId: 4 })).toBe(false);
    expect(sameFollowUp(f, { ...f, FollowUpDate: null })).toBe(false);
    expect(sameFollowUp(f, { ...f, DueDate: null })).toBe(false);
  });
});

describe("itemName", () => {
  it("collapses spaces and cuts long text", () => {
    expect(itemName("  Budget\n review ", "x")).toBe("Budget review");
    expect(itemName("a".repeat(41), "x")).toBe(`${"a".repeat(39)}…`);
    expect(itemName("a".repeat(40), "x")).toBe("a".repeat(40));
  });

  it("falls back when there is no text", () => {
    expect(itemName(null, "Agenda item")).toBe("Agenda item");
    expect(itemName("   ", "Agenda item")).toBe("Agenda item");
  });
});
