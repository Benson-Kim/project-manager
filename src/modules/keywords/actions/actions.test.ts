import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
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

import { AppError } from "@/lib/errors";
import { createKeywordAction, updateKeywordAction, deleteKeywordAction } from ".";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeywordId: 5,
    ProjectId: 2,
    Keyword: "MSSS",
    Definition: "Ministère de la Santé",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("keywords actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("keyword", "MSSS");
    fd.set("definition", "Ministère de la Santé");
    const result = await createKeywordAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.KeywordId).toBe(5);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Keyword_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Keyword).toBe("MSSS");
    expect(params.ActorUserId).toBe(7);
  });

  it("create returns VALIDATION with fieldErrors for an empty keyword", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("keyword", "  ");
    const result = await createKeywordAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.keyword).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("keyword", "MSSS");
    const result = await createKeywordAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(new AppError("CONFLICT", "Keyword was modified by someone else"));
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("keyword", "MSSS");
    fd.set("keywordId", "5");
    fd.set("rowVer", "41");
    const result = await updateKeywordAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteKeywordAction({ keywordId: 5, rowVer: 42 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_Keyword_Delete", {
      KeywordId: 5,
      RowVer: 42,
      ActorUserId: 7,
    });
  });
});
