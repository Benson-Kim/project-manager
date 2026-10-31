import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  addCascadeRequirement,
  createKeyDeliverable,
  removeCascadeRequirement,
  deleteWbsItem,
  getWbs,
  listDeliverableOptions,
  listKeyDeliverables,
  moveKeyDeliverable,
  moveCascadeRequirement,
  renameKeyDeliverable,
  rescheduleKeyDeliverable,
  setCascadeMoscow,
  setCascadePlanning,
  setPlanNote,
  setWbsItemNote,
  setWbsItemStatus,
  updateKeyDeliverable,
  updateCascadeRequirement,
} from "../repository/key-deliverables";
import {
  addRequirementInput,
  rescheduleWbsItemInput,
  updateKeyDeliverableInput,
  updateRequirementInput,
} from "../schemas/key-deliverable";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeyDeliverableId: 7,
    ProjectId: 24,
    KeyRequirement: "Fast reports generation",
    RequestedDate: null,
    Deadline: new Date("2026-12-26"),
    Priority: "Important",
    Status: "In Progress",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "2001", // driver returns CAST(RowVer AS BIGINT) as a string
    AssigneeNames: null,
    AssigneesJson: null,
    ...overrides,
  };
}

function wbsDbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeyDeliverableId: 7,
    ProjectId: 24,
    ParentKeyDeliverableId: null,
    SortOrder: 1,
    KeyRequirement: "Fast reports generation",
    RequestedDate: null,
    StartDate: new Date("2026-12-01"),
    Deadline: new Date("2026-12-26"),
    Priority: "Important",
    Status: "In Progress",
    Color: null,
    AssigneeNames: "Maggy Yerlan",
    AssigneesJson: JSON.stringify([{ id: 3, name: "Maggy Yerlan" }]),
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    ProjectStartDate: new Date("2026-01-01"),
    ProjectEndDate: new Date("2027-01-01"),
    Stamp: "90001",
    RowVer: "2001",
    ...overrides,
  };
}

/** The one row usp_KeyDeliverable_GanttData returns for a project without items. */
function projectOnlyRow() {
  return {
    ...Object.fromEntries(Object.keys(wbsDbRow()).map((k) => [k, null])),
    ProjectStartDate: new Date("2026-01-01"),
    ProjectEndDate: null,
    Stamp: "90002",
  };
}

describe("key-deliverables repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create forwards normalised params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createKeyDeliverable(
      { projectId: 24, keyRequirement: "Fast reports generation" },
      7,
    );
    expect(row.KeyDeliverableId).toBe(7);
    expect(row.RowVer).toBe(2001); // coerced to number by the row schema
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_KeyDeliverable_Create");
    expect(params.ProjectId).toBe(24);
    expect(params.RequestedDate).toBeNull();
    expect(params.Deadline).toBeNull();
    expect(params.AssigneeIds).toBeNull();
    expect(params.ActorUserId).toBe(7);
    expect(params.StartDate).toBeNull();
    expect(params.Color).toBeNull();
    expect(params.ParentKeyDeliverableId).toBeNull();
    expect(params.AfterKeyDeliverableId).toBeNull();
  });

  it("create places a work breakdown item under its parent, after a sibling", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createKeyDeliverable(
      {
        projectId: 24,
        keyRequirement: "Foundations",
        startDate: new Date("2026-04-16"),
        deadline: new Date("2026-04-19"),
        color: "green",
        parentId: 3,
        afterId: 5,
      },
      7,
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.StartDate).toEqual(new Date("2026-04-16"));
    expect(params.Color).toBe("green");
    expect(params.ParentKeyDeliverableId).toBe(3);
    expect(params.AfterKeyDeliverableId).toBe(5);
  });

  it("create refuses a colour outside the palette", async () => {
    await expect(
      createKeyDeliverable(
        { projectId: 24, keyRequirement: "R", color: "red;background:url(x)" as never },
        7,
      ),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create rejects an empty requirement before touching the database", async () => {
    await expect(
      createKeyDeliverable({ projectId: 24, keyRequirement: "  " }, 7),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("list forwards ADR-0016 params with the project scope and filters", async () => {
    execProc.mockResolvedValue([{ ...dbRow(), TotalCount: 1, ActorAccess: "Manager" }]);
    const params = listParamsSchema.parse({ sort: "Deadline", dir: "asc", page: "2" });
    const rows = await listKeyDeliverables(24, params, 7, {
      status: "In Progress",
      priority: "Important",
    });
    expect(rows[0].TotalCount).toBe(1);
    const [proc, procParams] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_KeyDeliverable_List");
    expect(procParams.ProjectId).toBe(24);
    expect(procParams.Status).toBe("In Progress");
    expect(procParams.Priority).toBe("Important");
    expect(procParams.SortBy).toBe("Deadline");
    expect(procParams.Page).toBe(2);
  });

  it("update forwards id + rowVer for the CONFLICT check", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateKeyDeliverable(
      { keyDeliverableId: 7, projectId: 24, keyRequirement: "R", rowVer: 2001 },
      7,
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_KeyDeliverable_Update");
    expect(params.KeyDeliverableId).toBe(7);
    expect(params.RowVer).toBe(2001);
  });

  it("update keeps the budget unless one was sent (BudgetSet), so an older form cannot clear it", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const base = { keyDeliverableId: 7, projectId: 24, keyRequirement: "R", rowVer: 2001 };
    await updateKeyDeliverable(base, 7);
    await updateKeyDeliverable({ ...base, budget: null }, 7);
    await updateKeyDeliverable({ ...base, budget: 1500.25 }, 7);
    const sent = execProc.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(sent.map((p) => [p.BudgetSet, p.Budget])).toEqual([
      [0, null],
      [1, null],
      [1, 1500.25],
    ]);
  });

  it("refuses a negative budget, or one with fractions of a cent", async () => {
    const base = { keyDeliverableId: 7, projectId: 24, keyRequirement: "R", rowVer: 2001 };
    await expect(updateKeyDeliverable({ ...base, budget: -1 }, 7)).rejects.toThrow();
    await expect(updateKeyDeliverable({ ...base, budget: 10.005 }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("update keeps the colour unless the form sent one (ColorSet), as older app versions do", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const base = { keyDeliverableId: 7, projectId: 24, keyRequirement: "R", rowVer: 2001 };
    await updateKeyDeliverable(base, 7);
    await updateKeyDeliverable({ ...base, color: null }, 7);
    await updateKeyDeliverable({ ...base, color: "purple" }, 7);
    const sent = execProc.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(sent.map((p) => [p.ColorSet, p.Color])).toEqual([
      [0, null],
      [1, null],
      [1, "purple"],
    ]);
  });

  describe("getWbs", () => {
    it("maps rows to breakdown items with the project window and the read stamp", async () => {
      execProc.mockResolvedValue([
        wbsDbRow(),
        wbsDbRow({ KeyDeliverableId: 8, ParentKeyDeliverableId: 7, Color: "red", RowVer: "2002" }),
      ]);
      const data = await getWbs(24, 7);
      expect(data.projectStart).toEqual(new Date("2026-01-01"));
      expect(data.projectEnd).toEqual(new Date("2027-01-01"));
      expect(data.stamp).toBe(90001);
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({
        id: 7,
        parentId: null,
        sortOrder: 1,
        name: "Fast reports generation",
        requestedDate: null,
        start: new Date("2026-12-01"),
        end: new Date("2026-12-26"),
        status: "In Progress",
        priority: "Important",
        color: null,
        isMilestone: false,
        assigneeNames: "Maggy Yerlan",
        assignees: [{ id: 3, name: "Maggy Yerlan" }],
        requirements: [],
        budget: null,
        note: null,
        rowVer: 2001,
      });
      expect(data.items[1]).toMatchObject({ id: 8, parentId: 7, color: "red", rowVer: 2002 });
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverable_GanttData");
      expect(params).toEqual({ ProjectId: 24, ActorUserId: 7, WithProjectRow: 1 });
    });

    // ADR-0046: the column arrived with migration 043, so a row from a database before it has no
    // IsMilestone at all and must still read as an ordinary task rather than failing the parse.
    it("reads a row from before migration 043 as a task, and an explicit flag as a milestone", async () => {
      execProc.mockResolvedValue([wbsDbRow()]);
      expect((await getWbs(24, 7)).items[0]).toMatchObject({ isMilestone: false });
      execProc.mockResolvedValue([
        wbsDbRow({ IsMilestone: true, Deadline: new Date("2026-12-01") }),
      ]);
      expect((await getWbs(24, 7)).items[0]).toMatchObject({
        isMilestone: true,
        start: new Date("2026-12-01"),
        end: new Date("2026-12-01"),
      });
    });

    it("keeps undated items (they get a bar by drawing or typing dates)", async () => {
      execProc.mockResolvedValue([wbsDbRow({ StartDate: null, Deadline: null })]);
      const { items } = await getWbs(24, 7);
      expect(items[0]).toMatchObject({ start: null, end: null });
    });

    // Dependencies (ADR-0046): every row carries the links it is the successor of, and the
    // repository flattens them into one graph with the successor filled in.
    it("flattens each row's predecessors into the project's links", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({ KeyDeliverableId: 7, PredecessorsJson: null }),
        wbsDbRow({
          KeyDeliverableId: 9,
          PredecessorsJson: JSON.stringify([
            { id: 4, predecessorId: 7, type: "FS", lagDays: 0, rowVer: 40 },
            { id: 5, predecessorId: 8, type: "SS", lagDays: -2, rowVer: 50 },
          ]),
        }),
      ]);
      const { links } = await getWbs(24, 7);
      expect(links).toEqual([
        { id: 4, predecessorId: 7, successorId: 9, type: "FS", lagDays: 0, rowVer: 40 },
        { id: 5, predecessorId: 8, successorId: 9, type: "SS", lagDays: -2, rowVer: 50 },
      ]);
    });

    it("reads a row from before migration 044 as one with no links", async () => {
      execProc.mockResolvedValue([wbsDbRow()]);
      expect((await getWbs(24, 7)).links).toEqual([]);
    });

    it("refuses a link payload the database could not have produced", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({
          PredecessorsJson: JSON.stringify([
            { id: 4, predecessorId: 7, type: "XX", lagDays: 0, rowVer: 40 },
          ]),
        }),
      ]);
      await expect(getWbs(24, 7)).rejects.toThrow();
    });

    it("reads the project window from the one row of a project without items", async () => {
      execProc.mockResolvedValue([projectOnlyRow()]);
      expect(await getWbs(24, 7)).toEqual({
        items: [],
        links: [],
        projectStart: new Date("2026-01-01"),
        projectEnd: null,
        stamp: 90002,
      });
    });

    it("normalises an empty assignee name and keeps names with commas whole", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({ AssigneeNames: " ", AssigneesJson: null }),
        wbsDbRow({
          KeyDeliverableId: 8,
          AssigneeNames: "Ministry of Education, Science and Technology",
          AssigneesJson: JSON.stringify([
            { id: 5, name: "Ministry of Education, Science and Technology" },
          ]),
        }),
      ]);
      const { items } = await getWbs(24, 7);
      expect(items[0].assigneeNames).toBeNull();
      expect(items[0].assignees).toEqual([]);
      expect(items[1].assignees).toEqual([
        { id: 5, name: "Ministry of Education, Science and Technology" },
      ]);
    });

    it("refuses a colour from the database outside the palette", async () => {
      execProc.mockResolvedValue([wbsDbRow({ Color: "#ff0000" })]);
      await expect(getWbs(24, 7)).rejects.toThrow();
    });

    it("refuses a need among an item's requirements, which the procs cannot allocate", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({
          RequirementsJson: JSON.stringify([
            {
              id: 42,
              type: "BR",
              ref: "BR-1",
              requirement: "Fewer delays",
              isMet: false,
              sortOrder: 1,
              rowVer: "3003",
              placeRowVer: "7003",
            },
          ]),
        }),
      ]);
      await expect(getWbs(24, 7)).rejects.toThrow();
    });

    it("reads each item's allocated requirements in order, and none when there are none", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({
          RequirementsJson: JSON.stringify([
            {
              id: 41,
              type: "NFR",
              ref: "NFR-2",
              requirement: "Soil report",
              isMet: false,
              sortOrder: 2,
              rowVer: "3002",
              placeRowVer: "7002",
            },
            {
              id: 40,
              type: "FR",
              ref: "FR-1.2",
              requirement: "Permit",
              isMet: true,
              sortOrder: 1,
              rowVer: "3001",
              placeRowVer: "7001",
              parentId: 38,
              moscow: "M",
              criteria: "Stamped by the council",
              estimateDays: 2.5,
              ownerId: 3,
              ownerName: "Maggy Yerlan",
            },
          ]),
        }),
        wbsDbRow({ KeyDeliverableId: 8, RequirementsJson: null }),
        wbsDbRow({ KeyDeliverableId: 9 }),
      ]);
      const { items } = await getWbs(24, 7);
      expect(items[0].requirements).toEqual([
        {
          id: 40,
          type: "FR",
          ref: "FR-1.2",
          text: "Permit",
          isMet: true,
          sortOrder: 1,
          rowVer: 3001,
          placeRowVer: 7001,
          parentId: 38,
          moscow: "M",
          criteria: "Stamped by the council",
          estimateDays: 2.5,
          ownerId: 3,
          ownerName: "Maggy Yerlan",
        },
        // An entry from before migration 051 carries no planning keys and reads as unset.
        {
          id: 41,
          type: "NFR",
          ref: "NFR-2",
          text: "Soil report",
          isMet: false,
          sortOrder: 2,
          rowVer: 3002,
          placeRowVer: 7002,
          parentId: null,
          moscow: null,
          criteria: null,
          estimateDays: null,
          ownerId: null,
          ownerName: null,
        },
      ]);
      expect(items[1].requirements).toEqual([]);
      expect(items[2].requirements).toEqual([]);
    });

    it("reads an item's budget and note (ADR-0052), and none from before migration 051", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({ Budget: 1250.5, Note: "Call the council first" }),
        wbsDbRow({ KeyDeliverableId: 8 }),
      ]);
      const { items } = await getWbs(24, 7);
      expect(items[0]).toMatchObject({ budget: 1250.5, note: "Call the council first" });
      expect(items[1]).toMatchObject({ budget: null, note: null });
    });

    it("refuses a MoSCoW code the database could not have stored", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({
          RequirementsJson: JSON.stringify([
            {
              id: 40,
              type: "FR",
              ref: "FR-1",
              requirement: "Permit",
              isMet: false,
              sortOrder: 1,
              rowVer: "3001",
              placeRowVer: "7001",
              moscow: "X",
            },
          ]),
        }),
      ]);
      await expect(getWbs(24, 7)).rejects.toThrow();
    });

    it("refuses malformed requirements rather than drop them", async () => {
      execProc.mockResolvedValue([wbsDbRow({ RequirementsJson: '{"id": 1}' })]);
      await expect(getWbs(24, 7)).rejects.toThrow("RequirementsJson must be a JSON array");
      execProc.mockResolvedValue([wbsDbRow({ RequirementsJson: JSON.stringify([{ id: 1 }]) })]);
      await expect(getWbs(24, 7)).rejects.toThrow();
    });
  });

  describe("listDeliverableOptions", () => {
    it("numbers the options by their place in the breakdown", async () => {
      execProc.mockResolvedValue([
        wbsDbRow({ KeyDeliverableId: 7, SortOrder: 1, KeyRequirement: "Discovery" }),
        wbsDbRow({
          KeyDeliverableId: 8,
          ParentKeyDeliverableId: 7,
          SortOrder: 1,
          KeyRequirement: "Site survey",
        }),
        wbsDbRow({ KeyDeliverableId: 9, SortOrder: 2, KeyRequirement: " Rollout " }),
      ]);
      expect(await listDeliverableOptions(24, 7)).toEqual([
        { id: 7, label: "1 Discovery" },
        { id: 8, label: "1.1 Site survey" },
        { id: 9, label: "2 Rollout" },
      ]);
    });

    it("falls back to the number alone for an item without a name", async () => {
      execProc.mockResolvedValue([wbsDbRow({ KeyRequirement: null })]);
      expect(await listDeliverableOptions(24, 7)).toEqual([{ id: 7, label: "1" }]);
    });

    it("offers nothing for a project without deliverables", async () => {
      execProc.mockResolvedValue([projectOnlyRow()]);
      expect(await listDeliverableOptions(24, 7)).toEqual([]);
    });
  });

  describe("work breakdown edits", () => {
    /** The edit proc answers with the item's project; the breakdown is then read for it. */
    function answer(projectId: unknown) {
      execProc
        .mockResolvedValueOnce([{ ProjectId: projectId }])
        .mockResolvedValueOnce([wbsDbRow()]);
    }

    it("move sends the new parent and place, then reads the project the proc names", async () => {
      answer(31);
      const data = await moveKeyDeliverable({ id: 7, parentId: 3, position: 2, rowVer: 2001 }, 9);
      expect(data.items.map((i) => i.id)).toEqual([7]);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_Move",
        {
          KeyDeliverableId: 7,
          ParentKeyDeliverableId: 3,
          Position: 2,
          RowVer: 2001,
          ActorUserId: 9,
        },
      ]);
      expect(execProc.mock.calls[1]).toEqual([
        "usp_KeyDeliverable_GanttData",
        { ProjectId: 31, ActorUserId: 9, WithProjectRow: 1 },
      ]);
    });

    it("reschedule sends both dates", async () => {
      answer(24);
      const start = new Date("2026-04-16");
      const end = new Date("2026-04-19");
      await rescheduleKeyDeliverable({ id: 7, start, end, rowVer: 2001 }, 9);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_Reschedule",
        { KeyDeliverableId: 7, StartDate: start, Deadline: end, RowVer: 2001, ActorUserId: 9 },
      ]);
    });

    it("rename sends the new name", async () => {
      answer(24);
      await renameKeyDeliverable({ id: 7, name: "Walls", rowVer: 2001 }, 9);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_Rename",
        { KeyDeliverableId: 7, KeyRequirement: "Walls", RowVer: 2001, ActorUserId: 9 },
      ]);
    });

    it("delete goes through the delete proc (the branch goes with the item)", async () => {
      answer(24);
      await deleteWbsItem({ id: 7, rowVer: 2001 }, 9);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_Delete",
        { KeyDeliverableId: 7, RowVer: 2001, ActorUserId: 9 },
      ]);
    });

    it("set status sends only the status (null clears it)", async () => {
      answer(24);
      await setWbsItemStatus({ id: 7, status: "Completed", rowVer: 2001 }, 9);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_SetStatus",
        { KeyDeliverableId: 7, Status: "Completed", RowVer: 2001, ActorUserId: 9 },
      ]);
    });

    /** A full app.Requirement row, as usp_Requirement_Create/Update answer (ADR-0037). */
    const reqRow = {
      RequirementId: 40,
      ProjectId: 31,
      RequirementType: "FR",
      Number: 1,
      Ref: "FR-1",
      SortPath: "0000000001",
      Depth: 0,
      ChildCount: 0,
      ParentRequirementId: null,
      MoSCoW: null,
      AcceptanceCriteria: null,
      EstimateDays: null,
      OwnerStakeholderId: null,
      OwnerName: null,
      Requirement: "Permit",
      IsMet: false,
      CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
      UpdatedAtUtc: null,
      RowVer: "3001",
      ValidatesJson: null,
      ValidatedByJson: null,
      DeliverablesJson: null,
    };

    it("adds a requirement already allocated to the item, answering with its id and project", async () => {
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      const data = await addCascadeRequirement(
        { projectId: 31, itemId: 7, type: "FR", text: "Permit" },
        9,
      );
      expect(data.id).toBe(40);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_Requirement_Create",
        {
          ProjectId: 31,
          RequirementType: "FR",
          Requirement: "Permit",
          IsMet: false,
          // No parent sent: a root requirement, allocated to the deliverable (ADR-0048).
          ParentRequirementId: null,
          ValidatesIds: null,
          KeyDeliverableIds: JSON.stringify([7]),
          MoSCoW: null,
          AcceptanceCriteria: null,
          EstimateDays: null,
          OwnerStakeholderId: null,
          ActorUserId: 9,
        },
      ]);
      expect(execProc.mock.calls[1]).toEqual([
        "usp_KeyDeliverable_GanttData",
        { ProjectId: 31, ActorUserId: 9, WithProjectRow: 1 },
      ]);
    });

    it("passes the quick-add's MoSCoW and parent through to the register (ADR-0052)", async () => {
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await addCascadeRequirement(
        {
          ...addRequirementInput.parse({
            projectId: 31,
            itemId: 7,
            type: "FR",
            text: "Permit",
            moscow: "S",
            parentRequirementId: 38,
          }),
        },
        9,
      );
      expect(execProc.mock.calls[0]![1]).toMatchObject({
        MoSCoW: "S",
        ParentRequirementId: 38,
        KeyDeliverableIds: JSON.stringify([7]),
      });
    });

    it("traces the quick-add's Meets choice to that need, and sends no trace without one", async () => {
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await addCascadeRequirement(
        addRequirementInput.parse({
          projectId: 31,
          itemId: 7,
          type: "NFR",
          text: "Fast",
          meetsId: 12,
        }),
        9,
      );
      expect(execProc.mock.calls[0]![1]).toMatchObject({ ValidatesIds: JSON.stringify([12]) });
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await addCascadeRequirement(
        addRequirementInput.parse({
          projectId: 31,
          itemId: 7,
          type: "NFR",
          text: "Fast",
          meetsId: null,
        }),
        9,
      );
      expect(execProc.mock.calls[2]![1]).toMatchObject({ ValidatesIds: null });
      expect(
        addRequirementInput.safeParse({
          projectId: 31,
          itemId: 7,
          type: "FR",
          text: "x",
          meetsId: 0,
        }).success,
      ).toBe(false);
    });

    it("sets MoSCoW and planning from the breakdown, answering with the whole breakdown", async () => {
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await setCascadeMoscow({ requirementId: 40, rowVer: 3001, moscow: "W" }, 9);
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await setCascadePlanning(
        {
          requirementId: 40,
          rowVer: 3002,
          acceptanceCriteria: "Signed",
          estimateDays: 1.5,
          ownerStakeholderId: null,
        },
        9,
      );
      expect(execProc.mock.calls.map((c) => c[0])).toEqual([
        "usp_Requirement_SetMoSCoW",
        "usp_KeyDeliverable_GanttData",
        "usp_Requirement_SetPlanning",
        "usp_KeyDeliverable_GanttData",
      ]);
      expect(execProc.mock.calls[0]![1]).toEqual({
        RequirementId: 40,
        MoSCoW: "W",
        RowVer: 3001,
        ActorUserId: 9,
      });
      expect(execProc.mock.calls[2]![1]).toEqual({
        RequirementId: 40,
        AcceptanceCriteria: "Signed",
        EstimateDays: 1.5,
        OwnerStakeholderId: null,
        RowVer: 3002,
        ActorUserId: 9,
      });
      // The breakdown is read for the project the requirement row reports, never the caller's.
      expect(execProc.mock.calls[1]![1]).toMatchObject({ ProjectId: reqRow.ProjectId });
    });

    it("saves an item's note and the project's sticky note with their row versions", async () => {
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      await setWbsItemNote({ id: 7, note: "Call first", rowVer: 2001 }, 9);
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_SetNote",
        { KeyDeliverableId: 7, Note: "Call first", RowVer: 2001, ActorUserId: 9 },
      ]);
      execProc.mockReset();
      execProc.mockResolvedValueOnce([{ RowVer: "88001" }]);
      expect(await setPlanNote({ projectId: 24, note: "", rowVer: 88000 }, 9)).toEqual({
        rowVer: 88001,
      });
      expect(execProc.mock.calls[0]).toEqual([
        "usp_KeyDeliverable_SetPlanNote",
        { ProjectId: 24, PlanNote: "", RowVer: 88000, ActorUserId: 9 },
      ]);
    });

    it("fails rather than guess when the plan note save returns no row version", async () => {
      execProc.mockResolvedValueOnce([]);
      await expect(setPlanNote({ projectId: 24, note: "x", rowVer: 1 }, 9)).rejects.toThrow();
    });

    it("fails rather than guess when creating a requirement returns no row", async () => {
      execProc.mockResolvedValueOnce([]);
      await expect(
        addCascadeRequirement({ projectId: 31, itemId: 7, type: "FR", text: "Permit" }, 9),
      ).rejects.toThrow();
    });

    it("edits, moves and removes an allocation through the requirements procs", async () => {
      // Edit (wording/tick) answers with the requirement row; move and remove answer with ProjectId.
      execProc.mockResolvedValueOnce([reqRow]).mockResolvedValueOnce([wbsDbRow()]);
      await updateCascadeRequirement(
        { id: 40, type: "FR", text: "Permit", isMet: true, rowVer: 3001 },
        9,
      );
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      await moveCascadeRequirement({ itemId: 7, id: 40, position: 2, rowVer: 5001 }, 9);
      execProc.mockResolvedValueOnce([{ ProjectId: 24 }]).mockResolvedValueOnce([wbsDbRow()]);
      await removeCascadeRequirement({ itemId: 7, id: 40, rowVer: 5001 }, 9);
      const writes = execProc.mock.calls.filter((_, i) => i % 2 === 0);
      expect(writes).toEqual([
        [
          "usp_Requirement_Update",
          {
            RequirementId: 40,
            RequirementType: "FR",
            Requirement: "Permit",
            IsMet: true,
            ValidatesSet: 0,
            ValidatesIds: null,
            DeliverablesSet: 0,
            KeyDeliverableIds: null,
            RowVer: 3001,
            ActorUserId: 9,
          },
        ],
        [
          "usp_Requirement_Move",
          { RequirementId: 40, KeyDeliverableId: 7, Position: 2, RowVer: 5001, ActorUserId: 9 },
        ],
        [
          "usp_Requirement_Unallocate",
          { RequirementId: 40, KeyDeliverableId: 7, RowVer: 5001, ActorUserId: 9 },
        ],
      ]);
    });

    it("fails rather than read some other project when the proc names none", async () => {
      execProc.mockResolvedValueOnce([]);
      await expect(
        moveKeyDeliverable({ id: 7, parentId: null, position: 1, rowVer: 2001 }, 9),
      ).rejects.toThrow("returned no ProjectId");
      expect(execProc).toHaveBeenCalledTimes(1);
    });
  });
});

describe("key-deliverable inputs", () => {
  it("drop the derived fields a row is read with, so a save cannot set them", () => {
    const parsed = updateKeyDeliverableInput.parse({
      projectId: 2,
      keyRequirement: "Walls",
      keyDeliverableId: 22,
      rowVer: 1,
      SubItemCount: 0,
      HasChildren: false,
      subItemCount: 0,
      hasChildren: false,
    });
    for (const key of ["SubItemCount", "HasChildren", "subItemCount", "hasChildren"]) {
      expect(parsed).not.toHaveProperty(key);
    }
    const reschedule = rescheduleWbsItemInput.parse({
      id: 22,
      start: "2024-05-01",
      end: "2024-05-02",
      rowVer: 1,
      HasChildren: false,
    });
    expect(reschedule).not.toHaveProperty("HasChildren");
  });

  it("refuse a need on the cascade's writes: only a solution goes to a deliverable (ADR-0037)", () => {
    const add = { projectId: 2, itemId: 22, text: "Permit" };
    expect(addRequirementInput.safeParse({ ...add, type: "FR" }).success).toBe(true);
    for (const type of ["BR", "SR", "XX"]) {
      expect(addRequirementInput.safeParse({ ...add, type }).success).toBe(false);
    }
    const update = { id: 40, text: "Permit", isMet: true, rowVer: 1 };
    expect(updateRequirementInput.safeParse({ ...update, type: "TR" }).success).toBe(true);
    expect(updateRequirementInput.safeParse({ ...update, type: "BR" }).success).toBe(false);
  });
});
