import { execProc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  createQuestionAnswerInput,
  questionAnswerListRowSchema,
  questionAnswerRowSchema,
  updateQuestionAnswerInput,
  type CreateQuestionAnswerInput,
  type CreateQuestionAnswerParsed,
  type QuestionAnswerListRow,
  type QuestionAnswerRow,
  type UpdateQuestionAnswerInput,
} from "../schemas/question-answer";

/**
 * QuestionAnswer repository — stored procedures only, zod row parsing
 * (STANDARDS §2.5), list params forwarded 1:1.
 */

export interface QAListFilters {
  category?: string | null;
  priority?: string | null;
}

function toProcParams(input: CreateQuestionAnswerParsed) {
  return {
    ProjectId: input.projectId,
    Question: input.question,
    Answer: input.answer ?? null,
    Category: input.category ?? null,
    Priority: input.priority ?? null,
    AssignedTo: input.assignedTo ?? null,
  };
}

export async function createQuestionAnswer(
  input: CreateQuestionAnswerInput,
  actorUserId: number,
): Promise<QuestionAnswerRow> {
  const parsed = createQuestionAnswerInput.parse(input);
  const rows = await execProc<QuestionAnswerRow>("usp_QuestionAnswer_Create", {
    ...toProcParams(parsed),
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Question/answer creation returned no row");
  return questionAnswerRowSchema.parse(rows[0]);
}

export async function getQuestionAnswerById(
  questionAnswerId: number,
  actorUserId: number,
): Promise<QuestionAnswerRow> {
  const rows = await execProc<QuestionAnswerRow>("usp_QuestionAnswer_GetById", {
    QuestionAnswerId: questionAnswerId,
    ActorUserId: actorUserId,
  });
  if (!rows[0]) throw new AppError("NOT_FOUND", `Question/answer ${questionAnswerId} not found`);
  return questionAnswerRowSchema.parse(rows[0]);
}

export async function listQuestionAnswers(
  params: ListParams,
  actorUserId: number,
  projectId: number,
  filters: QAListFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<QuestionAnswerListRow[]> {
  const rows = await execProc<QuestionAnswerListRow>("usp_QuestionAnswer_List", {
    ActorUserId: actorUserId,
    ProjectId: projectId,
    ...toProcListParams(params, pageSize),
    Category: filters.category ?? null,
    Priority: filters.priority ?? null,
  });
  return rows.map((r) => questionAnswerListRowSchema.parse(r));
}

export async function updateQuestionAnswer(
  input: UpdateQuestionAnswerInput,
  actorUserId: number,
): Promise<QuestionAnswerRow> {
  const parsed = updateQuestionAnswerInput.parse(input);
  const rows = await execProc<QuestionAnswerRow>("usp_QuestionAnswer_Update", {
    QuestionAnswerId: parsed.questionAnswerId,
    Question: parsed.question,
    Answer: parsed.answer ?? null,
    Category: parsed.category ?? null,
    Priority: parsed.priority ?? null,
    AssignedTo: parsed.assignedTo ?? null,
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
  });
  if (!rows[0])
    throw new AppError(
      "NOT_FOUND",
      `Question/answer ${parsed.questionAnswerId} not found or modified`,
    );
  return questionAnswerRowSchema.parse(rows[0]);
}

export async function deleteQuestionAnswer(
  questionAnswerId: number,
  rowVer: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_QuestionAnswer_Delete", {
    QuestionAnswerId: questionAnswerId,
    RowVer: rowVer,
    ActorUserId: actorUserId,
  });
}
