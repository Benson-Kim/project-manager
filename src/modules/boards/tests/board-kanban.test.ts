import { describe, expect, it } from "vitest";
import type { BoardCardListRow } from "../schemas/board-card";
import {
  NO_KANBAN_FILTER,
  cardHealth,
  cardKind,
  columnTones,
  dropPlacement,
  isKanbanFiltering,
  kanbanFilterOf,
  kanbanJson,
  kanbanShows,
  kanbanStats,
  laneOrder,
  placeCard,
  tallyPercent,
} from "../schemas/board-kanban";
import { cardLabel } from "../schemas/board-rules";

const free: BoardCardListRow = {
  BoardCardId: 1,
  BoardId: 3,
  BoardColumnId: 4,
  BoardSprintId: null,
  Title: "Book the room",
  AssigneeUserId: 9,
  DueDate: new Date("2026-11-05T00:00:00Z"),
  StoryPoints: 2,
  Color: null,
  SortKey: 1,
  RowVer: 1,
  RequirementState: "none",
  RequirementId: null,
  RequirementType: null,
  RequirementNumber: null,
  RequirementRef: null,
  RequirementText: null,
  RequirementIsMet: null,
  RequirementProjectId: null,
  RequirementMoSCoW: null,
  DeliverableState: "none",
  KeyDeliverableId: null,
  DeliverableProjectId: null,
  DeliverableTitle: null,
  DeliverableStatus: null,
  DeliverablePriority: null,
  DeliverableColor: null,
  DeliverableStartDate: null,
  DeliverableDeadline: null,
  DeliverableRequirementCount: null,
  DeliverableMetCount: null,
  DeliverableMustCount: null,
  DeliverableMustMetCount: null,
  DeliverableShouldCount: null,
  DeliverableCouldCount: null,
  DeliverableWontCount: null,
};

const requirement: BoardCardListRow = {
  ...free,
  BoardCardId: 2,
  Title: null,
  AssigneeUserId: null,
  DueDate: null,
  StoryPoints: null,
  RequirementState: "live",
  RequirementId: 20,
  RequirementType: "FR",
  RequirementNumber: 1,
  RequirementRef: "FR-1",
  RequirementText: "The system shall log in",
  RequirementIsMet: true,
  RequirementProjectId: 5,
  RequirementMoSCoW: "M",
};

const deliverable: BoardCardListRow = {
  ...free,
  BoardCardId: 3,
  BoardColumnId: 6,
  BoardSprintId: 8,
  Title: null,
  AssigneeUserId: null,
  DueDate: null,
  StoryPoints: null,
  DeliverableState: "live",
  KeyDeliverableId: 30,
  DeliverableProjectId: 5,
  DeliverableTitle: "Naming package",
  DeliverableStatus: "In progress",
  DeliverablePriority: "Critical",
  DeliverableRequirementCount: 4,
  DeliverableMetCount: 1,
  DeliverableMustCount: 3,
  DeliverableMustMetCount: 1,
  DeliverableShouldCount: 0,
  DeliverableCouldCount: 1,
  DeliverableWontCount: 0,
};

const restricted: BoardCardListRow = {
  ...free,
  BoardCardId: 4,
  Title: null,
  DeliverableState: "restricted",
};

describe("Kanban card kinds and labels", () => {
  it("names each kind from its source, a redacted source included", () => {
    expect(cardKind(free)).toBe("free");
    expect(cardKind(requirement)).toBe("requirement");
    expect(cardKind(deliverable)).toBe("deliverable");
    expect(cardKind(restricted)).toBe("deliverable");
  });

  it("labels a deliverable card by its deliverable and hides a restricted one", () => {
    expect(cardLabel(deliverable)).toBe("Naming package");
    expect(cardLabel({ ...deliverable, Title: "Own title" })).toBe("Own title");
    expect(cardLabel(restricted)).toBe("Restricted item");
    expect(cardLabel({ ...restricted, DeliverableState: "removed" })).toBe("Removed deliverable");
  });
});

describe("Kanban card health", () => {
  it("counts a deliverable's must-haves, its met requirements and each MoSCoW code in order", () => {
    expect(cardHealth(deliverable)).toEqual({
      must: { done: 1, total: 3 },
      met: { done: 1, total: 4 },
      moscow: [
        { code: "M", count: 3 },
        { code: "C", count: 1 },
      ],
    });
    expect(
      cardHealth({ ...deliverable, DeliverableShouldCount: 2, DeliverableWontCount: 1 }).moscow,
    ).toEqual([
      { code: "M", count: 3 },
      { code: "S", count: 2 },
      { code: "C", count: 1 },
      { code: "W", count: 1 },
    ]);
  });

  it("counts a requirement card as one requirement, a must-have when it is M", () => {
    expect(cardHealth(requirement)).toEqual({
      must: { done: 1, total: 1 },
      met: { done: 1, total: 1 },
      moscow: [{ code: "M", count: 1 }],
    });
    expect(cardHealth({ ...requirement, RequirementMoSCoW: "S", RequirementIsMet: false })).toEqual(
      { must: null, met: { done: 0, total: 1 }, moscow: [{ code: "S", count: 1 }] },
    );
  });

  it("has nothing to count on a free or restricted card, and 0/0 on an empty deliverable", () => {
    const none = { must: null, met: null, moscow: [] };
    expect(cardHealth(free)).toEqual(none);
    expect(cardHealth(restricted)).toEqual(none);
    expect(
      cardHealth({
        ...deliverable,
        DeliverableRequirementCount: 0,
        DeliverableMetCount: 0,
        DeliverableMustCount: 0,
        DeliverableMustMetCount: 0,
        DeliverableCouldCount: 0,
      }),
    ).toEqual({ must: { done: 0, total: 0 }, met: { done: 0, total: 0 }, moscow: [] });
  });

  it("rounds a tally to a whole percentage and has none without a total", () => {
    expect(tallyPercent({ done: 1, total: 3 })).toBe(33);
    expect(tallyPercent({ done: 0, total: 0 })).toBeNull();
    expect(tallyPercent(null)).toBeNull();
  });
});

describe("Kanban stats", () => {
  it("adds the must-haves of every card and counts the list's first priority", () => {
    expect(kanbanStats([free, requirement, deliverable, restricted], "Critical")).toEqual({
      cards: 4,
      mustHealth: 50,
      topPriority: 1,
    });
  });

  it("has no must-have health without must-haves, and no top priority without a list", () => {
    expect(kanbanStats([free], null)).toEqual({ cards: 1, mustHealth: null, topPriority: 0 });
  });
});

describe("Kanban filters", () => {
  const cards = [free, requirement, deliverable, restricted];
  const shown = (kind: string, moscow: string, priority: string) =>
    cards
      .filter((c) => kanbanShows(c, kanbanFilterOf(kind, moscow, priority)))
      .map((c) => c.BoardCardId);

  it("shows everything with no filter", () => {
    expect(isKanbanFiltering(NO_KANBAN_FILTER)).toBe(false);
    expect(shown("all", "all", "all")).toEqual([1, 2, 3, 4]);
  });

  it("filters by kind, by a MoSCoW code the card contains, and by deliverable priority", () => {
    expect(shown("deliverable", "all", "all")).toEqual([3, 4]);
    expect(shown("all", "M", "all")).toEqual([2, 3]);
    expect(shown("all", "C", "all")).toEqual([3]);
    expect(shown("all", "all", "Critical")).toEqual([3]);
    expect(shown("requirement", "C", "all")).toEqual([]);
  });

  it("reads a forged or blank value as no filter", () => {
    expect(kanbanFilterOf("epic", "X", " ")).toEqual(NO_KANBAN_FILTER);
    expect(isKanbanFiltering(kanbanFilterOf("free", "all", "all"))).toBe(true);
  });
});

describe("Kanban JSON copy", () => {
  it("exports what the board shows, with YYYY-MM-DD dates and names, never a hidden source", () => {
    const json = JSON.parse(
      kanbanJson([free, deliverable, restricted], {
        columns: new Map([
          [4, "To do"],
          [6, "Doing"],
        ]),
        sprints: new Map([[8, "Sprint 1"]]),
        assignees: new Map([[9, "Ann Lee"]]),
      }),
    ) as Record<string, unknown>[];
    expect(json[0]).toMatchObject({
      id: 1,
      title: "Book the room",
      kind: "free",
      column: "To do",
      sprint: null,
      assignee: "Ann Lee",
      due: "2026-11-05",
      points: 2,
    });
    expect(json[1]).toMatchObject({
      kind: "deliverable",
      column: "Doing",
      sprint: "Sprint 1",
      deliverable: "Naming package",
      priority: "Critical",
      moscow: { M: 3, C: 1 },
      mustHaves: { done: 1, total: 3 },
      due: null,
    });
    expect(json[2]).toMatchObject({
      title: "Restricted item",
      deliverable: null,
      status: null,
      priority: null,
      met: null,
    });
  });
});

describe("Kanban drag placement", () => {
  const at = (id: number, column: number, sprint: number | null = null): BoardCardListRow => ({
    ...free,
    BoardCardId: id,
    BoardColumnId: column,
    BoardSprintId: sprint,
  });
  const board = [at(1, 4), at(2, 4), at(3, 6), at(4, 6)];
  const ids = (cards: BoardCardListRow[], column: number) =>
    cards.filter((c) => c.BoardColumnId === column).map((c) => c.BoardCardId);

  it("puts a card before another in a column lane, or last when dropped past them all", () => {
    const before = dropPlacement(board, { itemId: 1, lane: "6", beforeId: 4 }, false)!;
    expect(before).toEqual({ cardId: 1, columnId: 6, sprintId: null, beforeId: 4 });
    expect(ids(placeCard(board, before), 6)).toEqual([3, 1, 4]);
    const last = dropPlacement(board, { itemId: 1, lane: "6" }, false)!;
    expect(ids(placeCard(board, last), 6)).toEqual([3, 4, 1]);
    expect(ids(placeCard(board, last), 4)).toEqual([2]);
  });

  it("keeps the column in the plan view and goes before a card of that column only", () => {
    const plan = [at(1, 4, null), at(2, 4, 8), at(3, 6, 8)];
    expect(dropPlacement(plan, { itemId: 1, lane: "8", beforeId: 2 }, true)).toEqual({
      cardId: 1,
      columnId: 4,
      sprintId: 8,
      beforeId: 2,
    });
    expect(dropPlacement(plan, { itemId: 1, lane: "8", beforeId: 3 }, true)?.beforeId).toBe(
      undefined,
    );
    expect(dropPlacement(plan, { itemId: 2, lane: "backlog" }, true)?.sprintId).toBeNull();
  });

  it("refuses an unknown card, a forged lane and a backlog drop on the board view", () => {
    expect(dropPlacement(board, { itemId: 99, lane: "6" }, false)).toBeNull();
    expect(dropPlacement(board, { itemId: 1, lane: "six" }, false)).toBeNull();
    expect(dropPlacement(board, { itemId: 1, lane: "backlog" }, false)).toBeNull();
  });

  it("tells a drop back on the same spot from a real move", () => {
    const same = dropPlacement(board, { itemId: 1, lane: "4", beforeId: 2 }, false)!;
    expect(laneOrder(placeCard(board, same), false)).toBe(laneOrder(board, false));
    const down = dropPlacement(board, { itemId: 1, lane: "4" }, false)!;
    expect(laneOrder(placeCard(board, down), false)).not.toBe(laneOrder(board, false));
  });
});

describe("Kanban column tones", () => {
  it("gives each stage of a five-column board its own colour", () => {
    expect(columnTones(["todo", "doing", "doing", "doing", "done"])).toEqual([
      "gray",
      "blue",
      "orange",
      "purple",
      "green",
    ]);
  });

  it("cycles the working colours past three working columns", () => {
    expect(columnTones(["doing", "doing", "doing", "doing"])).toEqual([
      "blue",
      "orange",
      "purple",
      "blue",
    ]);
  });
});
