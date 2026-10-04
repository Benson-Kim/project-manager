"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS } from "../schemas/question-answer";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";

/**
 * Q&A toolbar: search + category/priority filters + view toggle.
 * Filter values sync to the URL (searchParams) and are server-read by the
 * list page — no client-side filtering.
 */
export function QuestionsAnswersToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();
  const category = searchParams.get("category") ?? "";
  const priority = searchParams.get("priority") ?? "";

  return (
    <Toolbar>
      <SearchInput testId="qa-search" />
      {/* Controlled value without key= — removing key prevents remounting on
          every change which would destroy keyboard focus (WCAG 2.4.3). */}
      <select
        aria-label={messages.questionsAnswers.allCategories}
        value={category}
        onChange={(e) => update({ category: e.target.value || null, page: null })}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-ink"
      >
        <option value="">{messages.questionsAnswers.allCategories}</option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {messages.questionsAnswers.categoryLabels[opt]}
          </option>
        ))}
      </select>
      <select
        aria-label={messages.questionsAnswers.allPriorities}
        value={priority}
        onChange={(e) => update({ priority: e.target.value || null, page: null })}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-ink"
      >
        <option value="">{messages.questionsAnswers.allPriorities}</option>
        {PRIORITY_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {messages.questionsAnswers.priorityLabels[opt]}
          </option>
        ))}
      </select>
      {children}
    </Toolbar>
  );
}
