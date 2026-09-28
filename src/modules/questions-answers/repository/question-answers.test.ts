import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createQuestionAnswer,
  deleteQuestionAnswer,
  getQuestionAnswerById,
  listQuestionAnswers,
  updateQuestionAnswer,
} from "./question-answers";

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

describe("question-answers repository", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a non-empty question", async () => {
    await expect(
      createQuestionAnswer({ projectId: 2, question: "  " }, 7, "ProjectManager"),
    ).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createQuestionAnswer(
      { projectId: 2, question: "What is the scope?" },
      7,
      "ProjectManager",
    );
    expect(row.QuestionAnswerId).toBe(7);
    expect(row.RowVer).toBe(42);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_QuestionAnswer_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Question).toBe("What is the scope?");
    expect(params.ActorUserId).toBe(7);
    expect(params.ActorRole).toBe("ProjectManager");
    expect(params.Category).toBeNull();
    expect(params.Priority).toBeNull();
  });

  it("create forwards optional fields when provided", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await createQuestionAnswer(
      {
        projectId: 2,
        question: "What is the scope?",
        answer: "The full system.",
        category: "Technical",
        priority: "High",
        assignedTo: "Alice",
      },
      7,
      "Admin",
    );
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.Answer).toBe("The full system.");
    expect(params.Category).toBe("Technical");
    expect(params.Priority).toBe("High");
    expect(params.AssignedTo).toBe("Alice");
    expect(params.ActorRole).toBe("Admin");
  });

  it("getById parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getQuestionAnswerById(7, 1)).resolves.toMatchObject({
      Question: "What is the scope?",
    });
  });

  it("list forwards ADR-0016 params with project scope and filters", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 5 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listQuestionAnswers(params, 1, 2, {
      category: "Technical",
      priority: "High",
    });
    expect(rows[0].TotalCount).toBe(5);
    expect(execProc).toHaveBeenCalledWith("usp_QuestionAnswer_List", {
      ActorUserId: 1,
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
      Category: "Technical",
      Priority: "High",
    });
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1, QuestionAnswerId: "not-a-number" })]);
    await expect(listQuestionAnswers(listParamsSchema.parse({}), 1)).rejects.toThrow();
  });

  it("update carries rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateQuestionAnswer(
      {
        questionAnswerId: 7,
        rowVer: 42,
        projectId: 2,
        question: "Updated question",
      },
      1,
      "ProjectManager",
    );
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_QuestionAnswer_Update");
    expect(params.RowVer).toBe(42);
    expect(params.QuestionAnswerId).toBe(7);
    expect(params.ActorRole).toBe("ProjectManager");
  });

  it("delete forwards ids and rowVer to the proc", async () => {
    execProc.mockResolvedValue([]);
    await deleteQuestionAnswer(7, 42, 1, "Admin");
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_QuestionAnswer_Delete");
    expect(params.QuestionAnswerId).toBe(7);
    expect(params.RowVer).toBe(42);
    expect(params.ActorUserId).toBe(1);
    expect(params.ActorRole).toBe("Admin");
  });
});
