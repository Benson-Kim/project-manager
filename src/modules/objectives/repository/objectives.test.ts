import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createObjective,
  deleteObjective,
  getObjectiveById,
  listObjectives,
  updateObjective,
} from "./objectives";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ObjectiveId: 3,
    ProjectId: 2,
    QMeasurable: "Yes",
    QSuccess: "Yes",
    QAlignmentStrategy: "Yes",
    ObjectiveText: "Improve system reliability",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "99",
    ...overrides,
  };
}

describe("objectives repository (child entity of Project)", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a positive projectId", async () => {
    await expect(
      createObjective({ projectId: 0, objectiveText: "Test" }, 7),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createObjective(
      { projectId: 2, objectiveText: "Improve system reliability" },
      7,
    );
    expect(row.ObjectiveId).toBe(3);
    expect(row.RowVer).toBe(99);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Objective_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.ObjectiveText).toBe("Improve system reliability");
    expect(params.ActorUserId).toBe(7);
  });

  it("create sends null for unprovided optional fields", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createObjective({ projectId: 2, objectiveText: "Test" }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.QMeasurable).toBeNull();
    expect(params.QSuccess).toBeNull();
    expect(params.QAlignmentStrategy).toBeNull();
  });

  it("getById forwards ActorRole and parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getObjectiveById(3, 7, "ProjectManager")).resolves.toMatchObject({
      ObjectiveText: "Improve system reliability",
    });
    expect(execProc).toHaveBeenCalledWith("usp_Objective_GetById", {
      ObjectiveId: 3,
      ActorUserId: 7,
      ActorRole: "ProjectManager",
    });
  });

  it("getById — Admin role is forwarded (Admin bypass)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getObjectiveById(3, 99, "Admin");
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ActorRole).toBe("Admin");
  });

  it("list forwards the ADR-0016 params with the project scope filter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 4 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listObjectives(params, 7, 2, undefined, "ProjectManager");
    expect(rows[0].TotalCount).toBe(4);
    expect(execProc).toHaveBeenCalledWith("usp_Objective_List", {
      ActorUserId: 7,
      ActorRole: "ProjectManager",
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
    });
  });

  it("list forwards ActorRole: null when actorRole is omitted", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listObjectives(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ActorRole).toBeNull();
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 4, ObjectiveId: "bad" })]);
    await expect(listObjectives(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update and delete carry rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateObjective(
      {
        objectiveId: 3,
        rowVer: 99,
        projectId: 2,
        objectiveText: "Updated objective",
      },
      7,
    );
    let [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Objective_Update");
    expect(params.RowVer).toBe(99);

    execProc.mockResolvedValue([]);
    await deleteObjective(3, 99, 7);
    [proc, params] = execProc.mock.calls[1] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Objective_Delete");
    expect(params.ObjectiveId).toBe(3);
  });
});
