"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Assumptions & constraints toolbar: search + type filter (managed list,
 * ADR-0022) + view toggle. Filter values sync to the URL and are server-read by
 * the list page.
 */
export function AssumptionConstraintToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="assumption-constraint-search" />
      <ListFilter
        list="assumption-constraint.type"
        param="type"
        label={messages.assumptionsConstraints.type}
        allLabel={messages.assumptionsConstraints.allTypes}
        testId="filter-type"
      />
      {children}
    </Toolbar>
  );
}
