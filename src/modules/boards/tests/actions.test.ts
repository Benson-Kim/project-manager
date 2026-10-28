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

import { defaultBoardColumns } from "../schemas/board-rules";
import { createBoardAction, deleteBoardAction, updateBoardAction } from "../actions";

const dbRow = (overrides: Record<string, unknown> = {}) => ({
  BoardId: 3,
  ProjectId: 2,
  ProjectName: "Alpha",
  Name: "Delivery",
  Description: null,
  CreatedBy: 7,
  CreatedAtUtc: new Date("2026-10-22T09:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: "41",
  ActorAccess: "Manager",
  ...overrides,
});

beforeEach(() => {
  session = { userId: 7, username: "pm", role: "User" };
  execProc.mockReset();
  revalidatePath.mockReset();
  execProc.mockResolvedValue([dbRow()]);
});

describe("board actions", () => {
  it("creates a board and refreshes both routes it appears on", async () => {
    const result = await createBoardAction({
      projectId: 2,
      name: "Delivery",
      description: null,
      columns: defaultBoardColumns(),
    });
    expect(result.ok).toBe(true);
    expect(execProc.mock.calls[0][0]).toBe("usp_Board_Create");
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/boards", "/projects/2/boards"]);
  });

  it("refreshes only the cross-project list for a standalone board", async () => {
    execProc.mockResolvedValue([dbRow({ ProjectId: null, ProjectName: null })]);
    await createBoardAction({
      projectId: null,
      name: "Shared",
      description: null,
      columns: defaultBoardColumns(),
    });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/boards"]);
  });

  it("refuses a payload the contract does not accept, without calling a proc", async () => {
    const result = await createBoardAction({
      projectId: 2,
      name: "   ",
      description: null,
      columns: defaultBoardColumns(),
    });
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("never carries a server-owned field into the proc call", async () => {
    await createBoardAction({
      projectId: 2,
      name: "Delivery",
      description: null,
      columns: defaultBoardColumns(),
      boardId: 99,
      createdBy: 1,
      rowVer: 7,
    } as Parameters<typeof createBoardAction>[0]);
    expect(Object.keys(execProc.mock.calls[0][1] as object).sort()).toEqual([
      "ActorUserId",
      "ColumnsJson",
      "Description",
      "Name",
      "ProjectId",
    ]);
  });

  it("updates a board", async () => {
    const result = await updateBoardAction({
      boardId: 3,
      rowVer: 41,
      name: "Delivery board",
      description: null,
    });
    expect(result.ok).toBe(true);
    expect(execProc.mock.calls[0][0]).toBe("usp_Board_Update");
  });

  it("deletes a board and returns its id", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteBoardAction({ boardId: 3, rowVer: 41 });
    expect(result).toEqual({ ok: true, data: { boardId: 3 } });
    expect(execProc.mock.calls[0][0]).toBe("usp_Board_Delete");
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/boards"]);
  });

  it("refuses every intention when nobody is signed in", async () => {
    session = null;
    for (const result of [
      await createBoardAction({
        projectId: null,
        name: "Shared",
        description: null,
        columns: defaultBoardColumns(),
      }),
      await updateBoardAction({ boardId: 3, rowVer: 41, name: "x", description: null }),
      await deleteBoardAction({ boardId: 3, rowVer: 41 }),
    ]) {
      expect(result.ok).toBe(false);
    }
    expect(execProc).not.toHaveBeenCalled();
  });
});
