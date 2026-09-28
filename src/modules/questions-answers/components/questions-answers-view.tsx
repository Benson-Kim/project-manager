"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { listEmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { QuestionAnswerListRow } from "../schemas/question-answer";
import { QuestionsAnswersToolbar } from "./questions-answers-toolbar";

const columns: DataViewColumn<QuestionAnswerListRow>[] = [
  {
    key: "Question",
    header: messages.questionsAnswers.question,
    priority: 1,
    render: (r) => r.Question,
  },
  {
    key: "Category",
    header: messages.questionsAnswers.category,
    priority: 1,
    render: (r) => <Badge value={r.Category} />,
  },
  {
    key: "Priority",
    header: messages.questionsAnswers.priority,
    priority: 2,
    render: (r) => <Badge value={r.Priority} />,
  },
  {
    key: "AssignedTo",
    header: messages.questionsAnswers.assignedTo,
    priority: 2,
    render: (r) => r.AssignedTo,
  },
];

/**
 * Q&A list (module #11): DataView grid + list; opening a row syncs ?id= (Sheet).
 * Card: question text truncated to 2 lines, category badge, priority badge.
 */
export function QuestionsAnswersView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newQuestionAction,
}: {
  rows: QuestionAnswerListRow[];
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
      renderToolbar={(viewToggle) => (
        <QuestionsAnswersToolbar>{viewToggle}</QuestionsAnswersToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.questionsAnswers.emptyBody, newQuestionAction)}
    />
  );
}
