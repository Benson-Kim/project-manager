import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listProjectAssignees, setProjectAssignees } from "./project-assignees";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    ProjectAssigneeId: 1,
    ProjectId: 2,
    Role: "ProjectManager",
    PersonName: "Dana Roy",
    UserId: null,
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "77",
    ...overrides,
  };
}

describe("project assignees repository", () => {
  beforeEach(() => execProc.mockReset());

  it("set serialises the full assignee set as JSON for usp_ProjectAssignee_Set", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const rows = await setProjectAssignees(
      {
        projectId: 2,
        assignees: [{ role: "ProjectManager", personName: "Dana Roy" }],
      },
      7,
    );
    expect(rows[0].RowVer).toBe(77);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ProjectAssignee_Set");
    expect(params.ProjectId).toBe(2);
    expect(params.ActorUserId).toBe(7);
    expect(JSON.parse(params.AssigneesJson as string)).toEqual([
      { role: "ProjectManager", personName: "Dana Roy" },
    ]);
  });

  it("set rejects an unknown role before touching the database", async () => {
    await expect(
      setProjectAssignees(
        {
          projectId: 2,
          // @ts-expect-error — invalid role must be rejected by zod
          assignees: [{ role: "Chef", personName: "Dana Roy" }],
        },
        7,
      ),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("list forwards the project scope and parses rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    const rows = await listProjectAssignees(2, 7);
    expect(rows[0].PersonName).toBe("Dana Roy");
    expect(rows[0]).not.toHaveProperty("TotalCount"); // row schema strips it
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_ProjectAssignee_List");
    expect(params.ProjectId).toBe(2);
    expect(params.PageSize).toBe(100);
  });
});
