import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createKeyDeliverable,
  getGanttBars,
  listKeyDeliverables,
  updateKeyDeliverable,
} from "./key-deliverables";

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

function ganttDbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeyDeliverableId: 7,
    ProjectId: 24,
    KeyRequirement: "Fast reports generation",
    RequestedDate: null,
    Deadline: new Date("2026-12-26"),
    Priority: "Important",
    Status: "In Progress",
    AssigneeNames: "Maggy Yerlan",
    AssigneesJson: JSON.stringify([{ id: 3, name: "Maggy Yerlan" }]),
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    ProjectStartDate: new Date("2026-01-01"),
    ProjectEndDate: new Date("2027-01-01"),
    RowVer: "2001",
    ...overrides,
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
  });

  it("create rejects an empty requirement before touching the database", async () => {
    await expect(
      createKeyDeliverable({ projectId: 24, keyRequirement: "  " }, 7),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("list forwards ADR-0016 params with the project scope and filters", async () => {
    execProc.mockResolvedValue([{ ...dbRow(), TotalCount: 1 }]);
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

  describe("getGanttBars mapping", () => {
    const now = new Date("2026-09-16T12:00:00Z");

    it("maps rows to bars with CreatedAtUtc as start and Deadline as end", async () => {
      execProc.mockResolvedValue([ganttDbRow()]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars).toHaveLength(1);
      expect(bars[0]).toMatchObject({
        id: 7,
        requirement: "Fast reports generation",
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-12-26"),
        status: "In Progress",
        assigneeNames: "Maggy Yerlan",
        assignees: [{ id: 3, name: "Maggy Yerlan" }],
        overdue: false,
      });
      const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
      expect(proc).toBe("usp_KeyDeliverable_GanttData");
      expect(params.ProjectId).toBe(24);
    });

    it("skips rows without a deadline (not drawable)", async () => {
      execProc.mockResolvedValue([
        ganttDbRow(),
        ganttDbRow({ KeyDeliverableId: 8, Deadline: null }),
      ]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars.map((b) => b.id)).toEqual([7]);
    });

    it("clamps start to the deadline when the row was created after it (imported data)", async () => {
      execProc.mockResolvedValue([
        ganttDbRow({
          Deadline: new Date("2024-12-26"),
          CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
          Status: "Pending",
        }),
      ]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars[0].start).toEqual(new Date("2024-12-26"));
      expect(bars[0].overdue).toBe(true);
    });

    it("normalises an empty assignee name to null", async () => {
      execProc.mockResolvedValue([ganttDbRow({ AssigneeNames: " ", AssigneesJson: null })]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars[0].assigneeNames).toBeNull();
      expect(bars[0].assignees).toEqual([]);
    });

    it("parses assignees with commas in names without splitting", async () => {
      execProc.mockResolvedValue([
        ganttDbRow({
          AssigneeNames: "Ministry of Education, Science and Technology",
          AssigneesJson: JSON.stringify([
            { id: 5, name: "Ministry of Education, Science and Technology" },
          ]),
        }),
      ]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars[0].assignees).toHaveLength(1);
      expect(bars[0].assignees[0]).toEqual({
        id: 5,
        name: "Ministry of Education, Science and Technology",
      });
    });

    it("uses RequestedDate as bar start when set and before the deadline", async () => {
      execProc.mockResolvedValue([
        ganttDbRow({
          RequestedDate: new Date("2025-06-01T00:00:00Z"),
          CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
        }),
      ]);
      const bars = await getGanttBars(24, 7, now);
      expect(bars[0].start).toEqual(new Date("2025-06-01T00:00:00Z"));
    });
  });
});
