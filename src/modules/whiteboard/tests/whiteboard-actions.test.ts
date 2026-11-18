import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

let session: Session | null = { userId: 5, username: "pat", role: "User" };
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

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import {
  createWhiteboardAction,
  deleteWhiteboardAction,
  renameWhiteboardAction,
  saveWhiteboardAction,
} from "../actions";

const PAGE = "/projects/[id]/whiteboard";
const rect = { id: "r1", type: "rectangle", x: 0, y: 0 };
const board = { version: 1, elements: [rect], appState: { viewBackgroundColor: "#ffffff" } };

beforeEach(() => {
  execProc.mockReset();
  vi.mocked(revalidatePath).mockReset();
  session = { userId: 5, username: "pat", role: "User" };
});

describe("createWhiteboardAction", () => {
  it("creates in the project as the signed-in user and refreshes the page", async () => {
    execProc.mockResolvedValue([{ WhiteboardId: 7, Name: "Plan", RowVer: 1 }]);
    const result = await createWhiteboardAction({ projectId: 3, name: "  Plan " });
    expect(result).toEqual({ ok: true, data: { WhiteboardId: 7, Name: "Plan", RowVer: 1 } });
    expect(execProc).toHaveBeenCalledWith("usp_Whiteboard_Create", {
      ProjectId: 3,
      Name: "Plan",
      ActorUserId: 5,
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("asks for sign-in and touches nothing without a session", async () => {
    session = null;
    const result = await createWhiteboardAction({ projectId: 3, name: "Plan" });
    expect(!result.ok && result.error.code).toBe("UNAUTHENTICATED");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("refuses a role without the whiteboard permission before the database", async () => {
    session = { userId: 5, username: "pat", role: "Guest" as Role };
    const result = await createWhiteboardAction({ projectId: 3, name: "Plan" });
    expect(!result.ok && result.error.code).toBe("FORBIDDEN");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("passes on the refusal for a project the user cannot change", async () => {
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "No access"));
    const result = await createWhiteboardAction({ projectId: 99, name: "Plan" });
    expect(!result.ok && result.error.code).toBe("FORBIDDEN_ROW");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses fields the caller may not set", async () => {
    const result = await createWhiteboardAction({
      projectId: 3,
      name: "Plan",
      ActorUserId: 1,
      isDeleted: true,
    } as never);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });
});

describe("saveWhiteboardAction", () => {
  it("stores only the cleaned scene and leaves the page alone", async () => {
    execProc.mockResolvedValue([{ WhiteboardId: 7, ProjectId: 3, RowVer: 12 }]);
    const result = await saveWhiteboardAction({
      whiteboardId: 7,
      rowVer: 11,
      board: { ...board, appState: { viewBackgroundColor: "#ffffff", collaborators: {} } },
    });
    expect(result).toEqual({ ok: true, data: { WhiteboardId: 7, ProjectId: 3, RowVer: 12 } });
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Whiteboard_Update");
    expect(params).toEqual({
      WhiteboardId: 7,
      BoardJson: JSON.stringify(board),
      RowVer: 11,
      ActorUserId: 5,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a stale version as a conflict", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Changed by someone else"));
    const result = await saveWhiteboardAction({ whiteboardId: 7, rowVer: 10, board });
    expect(!result.ok && result.error.code).toBe("CONFLICT");
  });

  it("passes on the refusal for another project's board", async () => {
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "No access"));
    const result = await saveWhiteboardAction({ whiteboardId: 8, rowVer: 1, board });
    expect(!result.ok && result.error.code).toBe("FORBIDDEN_ROW");
  });

  it.each([
    ["an image", { ...board, elements: [{ id: "i1", type: "image", fileId: "f" }] }],
    ["a files map", { ...board, files: { f: { dataURL: "data:," } } }],
  ])("refuses a board with %s before the database", async (_label, bad) => {
    const result = await saveWhiteboardAction({ whiteboardId: 7, rowVer: 1, board: bad });
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });

  it("refuses a project id sent alongside the board", async () => {
    const result = await saveWhiteboardAction({
      whiteboardId: 7,
      rowVer: 1,
      board,
      projectId: 2,
    } as never);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(execProc).not.toHaveBeenCalled();
  });
});

describe("renameWhiteboardAction", () => {
  it("renames with the version it read and refreshes the page", async () => {
    execProc.mockResolvedValue([{ WhiteboardId: 7, ProjectId: 3, Name: "Map", RowVer: 4 }]);
    const result = await renameWhiteboardAction({ whiteboardId: 7, name: "Map", rowVer: 3 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Whiteboard_Rename", {
      WhiteboardId: 7,
      Name: "Map",
      RowVer: 3,
      ActorUserId: 5,
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("reports a board that no longer exists", async () => {
    execProc.mockRejectedValue(new AppError("NOT_FOUND", "Not found"));
    const result = await renameWhiteboardAction({ whiteboardId: 70, name: "Map", rowVer: 3 });
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});

describe("deleteWhiteboardAction", () => {
  it("deletes with the version it read and refreshes the page", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteWhiteboardAction({ whiteboardId: 7, rowVer: 4 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Whiteboard_Delete", {
      WhiteboardId: 7,
      RowVer: 4,
      ActorUserId: 5,
    });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("passes on the refusal for someone below manager", async () => {
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "No access"));
    const result = await deleteWhiteboardAction({ whiteboardId: 7, rowVer: 4 });
    expect(!result.ok && result.error.code).toBe("FORBIDDEN_ROW");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
