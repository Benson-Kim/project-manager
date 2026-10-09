"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Q&A toolbar: search + category/priority filters (managed lists, ADR-0022) +
 * view toggle. Filter values sync to the URL (searchParams) and are server-read
 * by the list page — no client-side filtering.
 */
export function QuestionsAnswersToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="qa-search" />
      <ListFilter
        list="question-answer.category"
        param="category"
        label={messages.questionsAnswers.category}
        allLabel={messages.questionsAnswers.allCategories}
        testId="filter-category"
      />
      <ListFilter
        list="question-answer.priority"
        param="priority"
        label={messages.questionsAnswers.priority}
        allLabel={messages.questionsAnswers.allPriorities}
        testId="filter-priority"
      />
      {children}
    </Toolbar>
  );
}
