"use client";

import { Badge } from "@/components/ui/badge";
import { listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createQuestionAnswerAction, updateQuestionAnswerAction } from "../actions";
import type { QuestionAnswerListRow, QuestionAnswerRow } from "../schemas/question-answer";
import { questionAnswerFormValues } from "../schemas/question-answer-form";
import { QuestionsAnswersToolbar } from "./questions-answers-toolbar";

type Row = QuestionAnswerListRow;
const P = messages.questionsAnswers.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "Question",
    header: messages.questionsAnswers.question,
    priority: 1,
    field: "question",
    value: (r) => r.Question,
    placeholder: P.question,
    maxLength: 4000,
  }),
  listColumn({
    key: "Category",
    header: messages.questionsAnswers.category,
    priority: 1,
    field: "category",
    list: "question-answer.category",
    value: (r) => r.Category,
    placeholder: P.category,
  }),
  listColumn({
    key: "Priority",
    header: messages.questionsAnswers.priority,
    priority: 2,
    field: "priority",
    list: "question-answer.priority",
    value: (r) => r.Priority,
    placeholder: P.priority,
  }),
  textColumn({
    key: "AssignedTo",
    header: messages.questionsAnswers.assignedTo,
    priority: 2,
    field: "assignedTo",
    value: (r) => r.AssignedTo,
    placeholder: P.assignedTo,
    maxLength: 255,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, QuestionAnswerRow>(
  questionAnswerFormValues,
  updateQuestionAnswerAction,
);
const canEditRow = rowAllows("questions-answers:update");

/**
 * Q&A list (module #11): DataView grid + list; opening a row syncs ?id= (Sheet).
 * Card: question text truncated to 2 lines, category badge, priority badge.
 * List view is a datasheet (ADR-0023): editable cells and a new-entry row.
 */
export function QuestionsAnswersView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  projectId,
  canCreate,
  newQuestionAction,
}: {
  rows: QuestionAnswerListRow[];
  projectId: number;
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newQuestionAction?: React.ReactNode;
}) {
  const { update, searchParams } = useListUrlState();

  return (
    <DataView
      moduleKey="questions-answers"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.QuestionAnswerId}
      getRowLabel={(row) => row.Question}
      filtersActive={filtersActive}
      onOpen={(row) =>
        update({ id: String(row.QuestionAnswerId), page: searchParams.get("page") ?? null })
      }
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          {/* Question truncated to 2 lines per spec */}
          <p className="line-clamp-2 text-sm font-semibold text-ink">{row.Question}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.Category} />
            <Badge value={row.Priority} />
          </div>
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) =>
                createQuestionAnswerAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      renderToolbar={(viewToggle) => (
        <QuestionsAnswersToolbar>{viewToggle}</QuestionsAnswersToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.questionsAnswers.emptyBody, newQuestionAction)}
    />
  );
}
