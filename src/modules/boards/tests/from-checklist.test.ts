import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { createBoardFromChecklistAction } from "../actions";

const dbRow = {
  BoardId: 3,
  ProjectId: 2,
  ProjectName: "Alpha",
  Name: "Launch steps",
  Description: null,
  CreatedBy: 7,
  CreatedAtUtc: new Date("2026-11-17T09:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "41",
  ActorAccess: "Contributor",
};

const input = { checklistId: 11, projectId: 2, name: " Launch steps ", method: "kanban" as const };

beforeEach(() => {
  session = { userId: 7, username: "pm", role: "User" };
  execProc.mockReset();
  revalidatePath.mockReset();
  execProc.mockResolvedValue([dbRow]);
});

describe("createBoardFromChecklistAction", () => {
  it("sends exactly the proc's parameters, with the default columns and no sprint for Kanban", async () => {
    const result = await createBoardFromChecklistAction(input);
    expect(result.ok).toBe(true);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Board_CreateFromChecklist");
    expect(Object.keys(params).sort()).toEqual(
      [
        "ActorUserId",
        "ChecklistId",
        "ColumnsJson",
        "Method",
        "Name",
        "ProjectId",
        "SprintName",
      ].sort(),
    );
    expect(params).toMatchObject({
      ChecklistId: 11,
      ProjectId: 2,
      Name: "Launch steps",
      Method: "kanban",
      SprintName: null,
      ActorUserId: 7,
    });
    const columns = JSON.parse(params.ColumnsJson as string) as Record<string, unknown>[];
    expect(columns.at(-1)?.category).toBe("done");
    expect(columns.every((c) => !("wipLimit" in c))).toBe(true);
  });

  it("names a first sprint for Scrum", async () => {
    await createBoardFromChecklistAction({ ...input, method: "scrum" });
    const params = execProc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params.Method).toBe("scrum");
    expect(params.SprintName).toBe("Sprint 1");
  });

  it("revalidates the cross-project list and the project's boards", async () => {
    await createBoardFromChecklistAction(input);
    expect(revalidatePath.mock.calls).toEqual([
      ["/boards", "layout"],
      ["/projects/2/boards", "layout"],
    ]);
  });

  it.each([
    { ...input, method: "waterfall" },
    { ...input, checklistId: 0 },
    { ...input, projectId: -1 },
    { ...input, name: "   " },
  ])("refuses %o without calling the database", async (bad) => {
    const result = await createBoardFromChecklistAction(bad as typeof input);
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    session = null;
    const result = await createBoardFromChecklistAction(input);
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });
});
