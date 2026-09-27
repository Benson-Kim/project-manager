import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createKeywordInput,
  keywordListRowSchema,
  keywordRowSchema,
  updateKeywordInput,
  type CreateKeywordInput,
  type CreateKeywordParsed,
  type KeywordListRow,
  type KeywordRow,
  type UpdateKeywordInput,
} from "../schemas/keyword";

/**
 * Keyword repository — stored procedures only , zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1 .
 */

function toProcParams(input: CreateKeywordParsed) {
  return {
    ProjectId: input.projectId ?? null,
    Keyword: input.keyword,
    Definition: input.definition ?? null,
  };
}

export async function createKeyword(
  input: CreateKeywordInput,
  actorUserId: number,
): Promise<KeywordRow> {
  const parsed = createKeywordInput.parse(input);
  const rows = await execProc<KeywordRow>("usp_Keyword_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  return keywordRowSchema.parse(rows[0]);
}

export async function getKeywordById(
  keywordId: number,
  actorUserId: number,
): Promise<KeywordRow> {
  const rows = await execProc<KeywordRow>("usp_Keyword_GetById", {
    KeywordId: keywordId,
    ActorUserId: actorUserId,
  });
  return keywordRowSchema.parse(rows[0]);
}

export async function listKeywords(
  params: ListParams,
  actorUserId: number,
  projectId: number | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<KeywordListRow[]> {
  const rows = await execProc<KeywordListRow>("usp_Keyword_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((r) => keywordListRowSchema.parse(r));
}

export async function updateKeyword(
  input: UpdateKeywordInput,
  actorUserId: number,
): Promise<KeywordRow> {
  const parsed = updateKeywordInput.parse(input);
  const rows = await execProc<KeywordRow>("usp_Keyword_Update", {
    KeywordId: parsed.keywordId,
    ...toProcParams(parsed),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  return keywordRowSchema.parse(rows[0]);
}

export async function deleteKeyword(
  keywordId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Keyword_Delete", {
    KeywordId: keywordId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
