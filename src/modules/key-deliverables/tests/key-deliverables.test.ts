import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createKeyDeliverable,
  deleteWbsItem,
  getWbs,
  listKeyDeliverables,
  moveKeyDeliverable,
  renameKeyDeliverable,
  rescheduleKeyDeliverable,
  updateKeyDeliverable,
} from "../repository/key-deliverables";

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
        assigneeNames: "Maggy Yerlan",
        assignees: [{ id: 3, name: "Maggy Yerlan" }],
        rowVer: 2001,
      });
      expect(data.items[1]).toMatchObject({ id: 8, parentId: 7, color: "red", rowVer: 2002 });
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverable_GanttData");
      expect(params).toEqual({ ProjectId: 24, ActorUserId: 7, WithProjectRow: 1 });
    });

    it("keeps undated items (they get a bar by drawing or typing dates)", async () => {
      execProc.mockResolvedValue([wbsDbRow({ StartDate: null, Deadline: null })]);
      const { items } = await getWbs(24, 7);
      expect(items[0]).toMatchObject({ start: null, end: null });
    });

    it("reads the project window from the one row of a project without items", async () => {
      execProc.mockResolvedValue([projectOnlyRow()]);
      expect(await getWbs(24, 7)).toEqual({
        items: [],
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

    it("fails rather than read some other project when the proc names none", async () => {
      execProc.mockResolvedValueOnce([]);
      await expect(
        moveKeyDeliverable({ id: 7, parentId: null, position: 1, rowVer: 2001 }, 9),
      ).rejects.toThrow("returned no ProjectId");
      expect(execProc).toHaveBeenCalledTimes(1);
    });
  });
});
