"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Risks & issues toolbar: search + category and status filters (managed lists,
 * ADR-0022) + view toggle. Filter values sync to the URL and are server-read by
 * the list page.
 */
export function RiskIssueToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="risk-issue-search" />
      <ListFilter
        list="risk-issue.category"
        param="category"
        label={messages.risksIssues.category}
        allLabel={messages.risksIssues.allCategories}
        testId="filter-category"
      />
      <ListFilter
        list="risk-issue.status"
        param="status"
        label={messages.risksIssues.status}
        allLabel={messages.risksIssues.allStatuses}
        testId="filter-status"
      />
      {children}
    </Toolbar>
  );
}
