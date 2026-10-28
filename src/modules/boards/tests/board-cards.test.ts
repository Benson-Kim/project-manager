import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
const execProcSets = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: (...args: unknown[]) => execProcSets(...args) as Promise<unknown[][]>,
}));

import { getBoard, listBoardAssignees } from "../repository/boards";
import {
  createBoardCard,
  deleteBoardCard,
  getBoardCardById,
  moveBoardCard,
  updateBoardCard,
} from "../repository/board-cards";
import {
  boardCardListRowSchema,
  createBoardCardInput,
  moveBoardCardInput,
  updateBoardCardInput,
} from "../schemas/board-card";
import { cardLabel, wipState } from "../schemas/board-rules";

const ACTOR = 7;

const cardDbRow = {
  BoardCardId: 11,
  BoardId: 3,
  BoardColumnId: 4,
  BoardSprintId: null,
  RequirementId: null,
  Title: "Write the migration",
  AssigneeUserId: null,
  DueDate: null,
  StoryPoints: 3,
  Color: "blue",
  SortKey: "2097152",
  RowVer: "9",
};

const lastParams = () => Object.keys(execProc.mock.calls.at(-1)![1] as object).sort();

beforeEach(() => {
  execProc.mockReset();
  execProcSets.mockReset();
  execProc.mockResolvedValue([cardDbRow]);
});

describe("board card contracts drop the fields the server owns", () => {
  it("a create cannot attach a requirement, a rank or a board of its own choosing", () => {
    const parsed = createBoardCardInput.parse({
      boardId: 3,
      boardColumnId: 4,
      title: "  Write the migration  ",
      requirementId: 99,
      sortKey: 5,
      createdBy: 1,
      rowVer: 2,
      isDeleted: false,
      boardCardId: 77,
    });
    expect(parsed.title).toBe("Write the migration");
    expect(Object.keys(parsed).sort()).toEqual(["boardColumnId", "boardId", "title"]);
  });

  it("an update owns none of the fields that would move or re-attach the card", () => {
    const parsed = updateBoardCardInput.parse({
      boardCardId: 11,
      rowVer: 9,
      title: "Renamed",
      assigneeUserId: null,
      dueDate: null,
      storyPoints: null,
      color: null,
      boardColumnId: 5,
      boardSprintId: 2,
      requirementId: 42,
      sortKey: 1,
      boardId: 8,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "assigneeUserId",
      "boardCardId",
      "color",
      "dueDate",
      "rowVer",
      "storyPoints",
      "title",
    ]);
  });

  it("refuses story points and colours the CHECK constraints would reject", () => {
    const base = { boardId: 3, boardColumnId: 4, title: "X" };
    expect(createBoardCardInput.safeParse({ ...base, storyPoints: 1000 }).success).toBe(false);
    expect(createBoardCardInput.safeParse({ ...base, storyPoints: -1 }).success).toBe(false);
    expect(
      createBoardCardInput.safeParse({ ...base, color: "red;background:url(x)" }).success,
    ).toBe(false);
    expect(createBoardCardInput.safeParse({ ...base, color: "chartreuse" }).success).toBe(false);
    expect(createBoardCardInput.safeParse({ ...base, color: "red" }).success).toBe(true);
  });

  it("refuses a title longer than the column holds", () => {
    const base = { boardId: 3, boardColumnId: 4 };
    expect(createBoardCardInput.safeParse({ ...base, title: "x".repeat(300) }).success).toBe(true);
    expect(createBoardCardInput.safeParse({ ...base, title: "x".repeat(301) }).success).toBe(false);
    expect(createBoardCardInput.safeParse({ ...base, title: "   " }).success).toBe(false);
  });

  it("defaults sprintSet to false, so a column move never empties the sprint by accident", () => {
    const parsed = moveBoardCardInput.parse({ boardCardId: 11, rowVer: 9, toColumnId: 5 });
    expect(parsed.sprintSet).toBe(false);
    expect(
      moveBoardCardInput.parse({
        boardCardId: 11,
        rowVer: 9,
        toColumnId: 5,
        toSprintId: null,
        sprintSet: true,
      }).sprintSet,
    ).toBe(true);
  });
});

describe("board card repository sends exactly the parameters each proc declares", () => {
  it("usp_BoardCard_Create, even when the payload carries server-owned keys", async () => {
    await createBoardCard(
      { boardId: 3, boardColumnId: 4, title: "Write it", requirementId: 99, sortKey: 1 } as never,
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardCard_Create");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "AssigneeUserId",
      "BoardColumnId",
      "BoardId",
      "BoardSprintId",
      "Color",
      "DueDate",
      "Notes",
      "StoryPoints",
      "Title",
    ]);
  });

  it("usp_BoardCard_Update never sends a column, sprint, board or requirement", async () => {
    await updateBoardCard(
      {
        boardCardId: 11,
        rowVer: 9,
        title: "Renamed",
        assigneeUserId: null,
        dueDate: null,
        storyPoints: null,
        color: null,
        boardColumnId: 5,
        requirementId: 42,
      } as never,
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardCard_Update");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "AssigneeUserId",
      "BoardCardId",
      "Color",
      "DueDate",
      "Notes",
      "RowVer",
      "StoryPoints",
      "Title",
    ]);
  });

  it("usp_BoardCard_Move", async () => {
    await moveBoardCard(
      {
        boardCardId: 11,
        rowVer: 9,
        toColumnId: 5,
        toSprintId: 2,
        sprintSet: true,
        beforeCardId: 8,
      },
      ACTOR,
    );
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardCard_Move");
    expect(lastParams()).toEqual([
      "ActorUserId",
      "BeforeCardId",
      "BoardCardId",
      "RowVer",
      "SprintSet",
      "ToColumnId",
      "ToSprintId",
    ]);
  });

  it("usp_BoardCard_Delete", async () => {
    execProc.mockResolvedValue([]);
    await deleteBoardCard({ boardCardId: 11, rowVer: 9 }, ACTOR);
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardCard_Delete");
    expect(lastParams()).toEqual(["ActorUserId", "BoardCardId", "RowVer"]);
  });

  it("reads the rank and row version the driver returns as strings", async () => {
    const row = await createBoardCard({ boardId: 3, boardColumnId: 4, title: "X" }, ACTOR);
    expect(row.RowVer).toBe(9);
    expect(row.SortKey).toBe(2097152);
  });

  it("usp_BoardCard_GetById, and it refuses a card the proc did not return", async () => {
    execProc.mockResolvedValue([]);
    await expect(getBoardCardById(11, ACTOR)).rejects.toThrow();
    expect(execProc.mock.calls[0][0]).toBe("usp_BoardCard_GetById");
    expect(lastParams()).toEqual(["ActorUserId", "BoardCardId"]);
  });

  it("usp_Board_ListAssignees returns names and nothing else about a person", async () => {
    execProc.mockResolvedValue([{ UserId: 4, DisplayName: "Ada", Email: "a@b.c", RoleId: 2 }]);
    const rows = await listBoardAssignees(3, ACTOR, "ad");
    expect(execProc.mock.calls[0][0]).toBe("usp_Board_ListAssignees");
    expect(lastParams()).toEqual(["ActorUserId", "BoardId", "Search"]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["DisplayName", "UserId"]);
  });
});

describe("the board read", () => {
  const header = {
    BoardId: 3,
    ProjectId: null,
    ProjectName: null,
    Name: "Delivery",
    Description: null,
    CreatedBy: 1,
    CreatedAtUtc: new Date(),
    UpdatedAtUtc: null,
    RowVer: "4",
    ActorAccess: "Contributor",
    ActorGrants: null,
    ActorRevokes: null,
    Stamp: "99",
    ActiveSprintId: null,
    BacklogCount: 2,
  };

  it("sends exactly the parameters usp_Board_GetBoard declares, and parses all five sets", async () => {
    execProcSets.mockResolvedValue([
      [header],
      [
        {
          ...{
            BoardColumnId: 4,
            BoardId: 3,
            Name: "To do",
            Category: "todo",
            WipLimit: 5,
            SortOrder: 1,
            RowVer: "2",
          },
          CardCount: 3,
          WipCount: 2,
        },
      ],
      [],
      [],
      [
        {
          ...cardDbRow,
          RequirementState: "none",
          RequirementType: null,
          RequirementNumber: null,
          RequirementText: null,
          RequirementIsMet: null,
          RequirementProjectId: null,
        },
      ],
    ]);
    const view = await getBoard({ boardId: 3 }, ACTOR);
    expect(execProcSets.mock.calls[0][0]).toBe("usp_Board_GetBoard");
    expect(Object.keys(execProcSets.mock.calls[0][1] as object).sort()).toEqual([
      "ActorUserId",
      "BoardId",
      "CardsPerList",
      "Search",
      "SprintId",
      "View",
    ]);
    expect(view.header.Stamp).toBe(99);
    expect(view.columns[0]!.WipCount).toBe(2);
    expect(view.cards).toHaveLength(1);
  });

  it("asks for the board view and 50 cards a list unless told otherwise", async () => {
    execProcSets.mockResolvedValue([[header], [], [], [], []]);
    await getBoard({ boardId: 3 }, ACTOR);
    const params = execProcSets.mock.calls[0][1] as { View: string; CardsPerList: number };
    expect(params.View).toBe("board");
    expect(params.CardsPerList).toBe(50);
  });

  it("refuses to ask for more cards per list than the proc would return", async () => {
    execProcSets.mockResolvedValue([[header], [], [], [], []]);
    await expect(getBoard({ boardId: 3, cardsPerList: 5000 }, ACTOR)).rejects.toThrow();
  });

  it("accepts a restricted card, whose requirement columns are all null", () => {
    const row = boardCardListRowSchema.parse({
      ...cardDbRow,
      Title: null,
      RequirementState: "restricted",
      RequirementType: null,
      RequirementNumber: null,
      RequirementText: null,
      RequirementIsMet: null,
      RequirementProjectId: null,
    });
    expect(row.RequirementState).toBe("restricted");
    expect(row.RequirementText).toBeNull();
  });
});

describe("pure card rules", () => {
  it("reports a column's load against its limit, including legitimately over", () => {
    expect(wipState(0, null)).toBe("none");
    expect(wipState(99, null)).toBe("none");
    expect(wipState(2, 5)).toBe("ok");
    expect(wipState(5, 5)).toBe("full");
    expect(wipState(7, 5)).toBe("over");
  });

  it("labels a card without leaking what a restricted one hides", () => {
    const base = {
      Title: null,
      RequirementState: "none" as const,
      RequirementType: null,
      RequirementNumber: null,
      RequirementText: null,
    };
    expect(cardLabel({ ...base, Title: "Write it" })).toBe("Write it");
    expect(
      cardLabel({ ...base, RequirementState: "live", RequirementText: "The system shall…" }),
    ).toBe("The system shall…");
    const restricted = cardLabel({ ...base, RequirementState: "restricted" });
    expect(restricted).toBe("Restricted item");
    expect(restricted).not.toContain("shall");
    expect(cardLabel({ ...base, RequirementState: "removed" })).toBe("Removed requirement");
    expect(cardLabel(base)).toBe("Untitled card");
  });
});
