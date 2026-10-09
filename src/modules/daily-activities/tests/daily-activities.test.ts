import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createDailyActivity,
  deleteDailyActivity,
  getDailyActivityById,
  listDailyActivities,
  updateDailyActivity,
} from "../repository/daily-activities";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    DailyActivityId: 10,
    ProjectId: 3,
    ActivityStatusId: 1,
    ActivityStatus: "Not Started",
    Requester: "Alice",
    Task: "Write unit tests",
    MyActivity: null,
    ActivityDate: new Date("2025-06-01T00:00:00Z"),
    Comments: null,
    RequestDate: new Date("2025-05-30T00:00:00Z"),
    Status: null,
    CompleteDate: null,
    ContactMethod: "Email",
    TimeSpent: 2,
    AssignedTo: "Bob",
    TaskType: "Technical",
    Progress: 50,
    CreatedAtUtc: new Date("2025-06-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "88",
    ...overrides,
  };
}

describe("daily-activities repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a projectId", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createDailyActivity({ projectId: 3 }, 7);
    expect(row.DailyActivityId).toBe(10);
    expect(row.RowVer).toBe(88);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_DailyActivity_Create");
    expect(params.ProjectId).toBe(3);
    expect(params.ActorUserId).toBe(7);
  });

  it("create forwards optional fields as null when absent", async () => {
    execProc.mockResolvedValue([dbRow({ Task: null, Requester: null })]);
    await createDailyActivity({ projectId: 3 }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Task).toBeNull();
    expect(params.Requester).toBeNull();
  });

  it("create forwards nullable numeric fields", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createDailyActivity({ projectId: 3, timeSpent: 4, progress: 75 }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.TimeSpent).toBe(4);
    expect(params.Progress).toBe(75);
  });

  it("getById sends only the actor id (no role, ADR-0021) and parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getDailyActivityById(10, 7)).resolves.toMatchObject({ Task: "Write unit tests" });
    expect(execProc).toHaveBeenCalledWith("usp_DailyActivity_GetById", {
      DailyActivityId: 10,
      ActorUserId: 7,
    });
  });

  it("getById — Admin role is forwarded (Admin bypass)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getDailyActivityById(10, 99);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list forwards ADR-0016 params with project scope", async () => {
    execProc.mockResolvedValue([
      dbRow({ ProjectName: "Charter", TotalCount: 5, ActorAccess: "Contributor" }),
    ]);
    const params = listParamsSchema.parse({ page: "1" });
    const rows = await listDailyActivities(params, 7, 3);
    expect(rows[0].TotalCount).toBe(5);
    expect(execProc).toHaveBeenCalledWith("usp_DailyActivity_List", {
      ActorUserId: 7,
      ProjectId: 3,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 1,
      PageSize: 25,
      ActivityStatusId: null,
      TaskType: null,
      WithoutProject: false,
    });
  });

  it("list sends no role to the proc (ADR-0021)", async () => {
    execProc.mockResolvedValue([
      dbRow({ ProjectName: "Charter", TotalCount: 1, ActorAccess: "Contributor" }),
    ]);
    await listDailyActivities(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list accepts null projectId for cross-project queries", async () => {
    execProc.mockResolvedValue([
      dbRow({ ProjectName: "Charter", TotalCount: 1, ActorAccess: "Contributor" }),
    ]);
    await listDailyActivities(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBeNull();
  });

  it("list forwards activityStatusId and taskType filter params to the proc", async () => {
    execProc.mockResolvedValue([
      dbRow({ ProjectName: "Charter", TotalCount: 1, ActorAccess: "Contributor" }),
    ]);
    await listDailyActivities(listParamsSchema.parse({}), 7, 3, 25, {
      activityStatusId: 2,
      taskType: "Technical",
    });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_DailyActivity_List");
    expect(params.ActivityStatusId).toBe(2);
    expect(params.TaskType).toBe("Technical");
  });

  it("list sends null filter params when filters object is omitted", async () => {
    execProc.mockResolvedValue([
      dbRow({ ProjectName: "Charter", TotalCount: 1, ActorAccess: "Contributor" }),
    ]);
    await listDailyActivities(listParamsSchema.parse({}), 7, 3);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ActivityStatusId).toBeNull();
    expect(params.TaskType).toBeNull();
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ DailyActivityId: "not-a-number" })]);
    await expect(listDailyActivities(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update forwards RowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateDailyActivity({ dailyActivityId: 10, rowVer: 88, projectId: 3 }, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_DailyActivity_Update");
    expect(params.RowVer).toBe(88);
    expect(params.DailyActivityId).toBe(10);
  });

  it("delete forwards DailyActivityId and RowVer", async () => {
    execProc.mockResolvedValue([]);
    await deleteDailyActivity(10, 88, 7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_DailyActivity_Delete");
    expect(params.DailyActivityId).toBe(10);
    expect(params.RowVer).toBe(88);
  });
});
