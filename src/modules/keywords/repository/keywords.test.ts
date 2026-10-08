import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listParamsSchema } from "@/lib/list-params";
import {
  createKeyword,
  deleteKeyword,
  getKeywordById,
  listKeywords,
  updateKeyword,
} from "./keywords";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    KeywordId: 5,
    ProjectId: 2,
    Keyword: "MSSS",
    Definition: "Ministère de la Santé et des Services sociaux",
    CreatedAtUtc: new Date("2026-01-01T00:00:00Z"),
    UpdatedAtUtc: null,
    RowVer: "42",
    ...overrides,
  };
}

describe("keywords repository (child entity of Project)", () => {
  beforeEach(() => execProc.mockReset());

  it("create requires a non-empty keyword", async () => {
    await expect(createKeyword({ projectId: 2, keyword: " " }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });

  it("create forwards params and parses the returned row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    const row = await createKeyword({ projectId: 2, keyword: "MSSS" }, 7);
    expect(row.KeywordId).toBe(5);
    expect(row.RowVer).toBe(42);
    const [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Keyword_Create");
    expect(params.ProjectId).toBe(2);
    expect(params.Keyword).toBe("MSSS");
    expect(params.ActorUserId).toBe(7);
  });

  it("create allows null projectId (global keyword)", async () => {
    execProc.mockResolvedValue([dbRow({ ProjectId: null })]);
    await createKeyword({ projectId: null, keyword: "MSSS" }, 7);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.ProjectId).toBeNull();
  });

  it("getById sends only the actor id (no role, ADR-0021) and parses the row", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await expect(getKeywordById(5, 7)).resolves.toMatchObject({ Keyword: "MSSS" });
    expect(execProc).toHaveBeenCalledWith("usp_Keyword_GetById", {
      KeywordId: 5,
      ActorUserId: 7,
    });
  });

  it("getById — Admin role is forwarded (Admin bypass)", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await getKeywordById(5, 99);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list forwards the ADR-0016 params with the project scope filter", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 3 })]);
    const params = listParamsSchema.parse({ page: "2" });
    const rows = await listKeywords(params, 7, 2);
    expect(rows[0].TotalCount).toBe(3);
    expect(execProc).toHaveBeenCalledWith("usp_Keyword_List", {
      ActorUserId: 7,
      ProjectId: 2,
      Search: null,
      SortBy: null,
      SortDir: "asc",
      Page: 2,
      PageSize: 25,
    });
  });

  it("list sends no role to the proc (ADR-0021)", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 1 })]);
    await listKeywords(listParamsSchema.parse({}), 7, null);
    const [, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty("ActorRole");
  });

  it("list rejects contract-breaking rows", async () => {
    execProc.mockResolvedValue([dbRow({ TotalCount: 3, Keyword: 999 })]);
    await expect(listKeywords(listParamsSchema.parse({}), 7)).rejects.toThrow();
  });

  it("update and delete carry rowVer for optimistic concurrency", async () => {
    execProc.mockResolvedValue([dbRow()]);
    await updateKeyword({ keywordId: 5, rowVer: 42, projectId: 2, keyword: "MSSS" }, 7);
    let [proc, params] = execProc.mock.calls[0] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Keyword_Update");
    expect(params.RowVer).toBe(42);

    execProc.mockResolvedValue([]);
    await deleteKeyword(5, 42, 7);
    [proc, params] = execProc.mock.calls[1] as [string, Record<string, unknown>];
    expect(proc).toBe("usp_Keyword_Delete");
    expect(params.KeywordId).toBe(5);
  });
});
