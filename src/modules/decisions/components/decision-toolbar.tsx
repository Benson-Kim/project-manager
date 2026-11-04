"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Decision log toolbar: search + status and impacted-area filters (managed
 * lists, ADR-0022) + view toggle. Filter values sync to the URL and are
 * server-read by the list page.
 */
export function DecisionToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="decision-search" />
      <ListFilter
        list="decision.status"
        param="status"
        label={messages.decisions.status}
        allLabel={messages.decisions.allStatuses}
        testId="filter-status"
      />
      <ListFilter
        list="decision.impacted-area"
        param="area"
        label={messages.decisions.impactedAreas}
        allLabel={messages.decisions.allAreas}
        testId="filter-area"
      />
      {children}
    </Toolbar>
  );
}
