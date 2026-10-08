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
import {
  createQuestionAnswerAction,
  deleteQuestionAnswerAction,
  updateQuestionAnswerAction,
} from "../actions";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    QuestionAnswerId: 7,
    ProjectId: 2,
    Question: "What is the scope?",
    Answer: "The full system.",
    Category: "Technical",
    Priority: "High",
    AssignedTo: "Alice",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("questions-answers actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    revalidatePath.mockClear();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it("create succeeds from FormData", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "What is the scope?");
    const result = await createQuestionAnswerAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.QuestionAnswerId).toBe(7);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_QuestionAnswer_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Question).toBe("What is the scope?");
    expect(params.ActorUserId).toBe(7);
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("create returns VALIDATION with fieldErrors for an empty question", async () => {
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "  ");
    const result = await createQuestionAnswerAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.question).toBeDefined();
    }
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "What is the scope?");
    const result = await createQuestionAnswerAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });

  it("create reaches the proc for any User; the proc checks Contributor (ADR-0021)", async () => {
    session = { userId: 8, username: "contrib", role: "User" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "What is the scope?");
    const result = await createQuestionAnswerAction(fd);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.QuestionAnswerId).toBe(7);
    expect(execProc).toHaveBeenCalledWith(
      "usp_QuestionAnswer_Create",
      expect.objectContaining({ ActorUserId: 8 }),
    );
  });

  // ── update ───────────────────────────────────────────────────────────────

  it("update succeeds for a Contributor (Contributor can update)", async () => {
    session = { userId: 8, username: "contrib", role: "User" };
    execProc.mockResolvedValue([dbRow()]);
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "Updated question");
    fd.set("questionAnswerId", "7");
    fd.set("rowVer", "42");
    const result = await updateQuestionAnswerAction(fd);
    expect(result.ok).toBe(true);
  });

  it("update maps a rowversion mismatch to CONFLICT", async () => {
    execProc.mockRejectedValue(
      new AppError("CONFLICT", "Question/answer was modified by someone else"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "What is the scope?");
    fd.set("questionAnswerId", "7");
    fd.set("rowVer", "41");
    const result = await updateQuestionAnswerAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("update surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const fd = new FormData();
    fd.set("projectId", "2");
    fd.set("question", "What is the scope?");
    fd.set("questionAnswerId", "7");
    fd.set("rowVer", "42");
    const result = await updateQuestionAnswerAction(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
  });

  // ── delete ───────────────────────────────────────────────────────────────

  it("delete succeeds and forwards ids to the proc", async () => {
    execProc.mockResolvedValue([]);
    const result = await deleteQuestionAnswerAction({ questionAnswerId: 7, rowVer: 42 });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_QuestionAnswer_Delete", {
      QuestionAnswerId: 7,
      RowVer: 42,
      ActorUserId: 7,
    });
  });

  it("delete surfaces the proc's FORBIDDEN_ROW when the project level is too low", async () => {
    execProc.mockRejectedValue(
      new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
    );
    const result = await deleteQuestionAnswerAction({ questionAnswerId: 7, rowVer: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
    expect(execProc).toHaveBeenCalledOnce();
  });
});
