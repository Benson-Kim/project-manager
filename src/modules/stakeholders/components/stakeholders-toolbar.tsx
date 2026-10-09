"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";

import { messages } from "@/lib/messages";
import { ListFilter } from "@/components/ui/data-view/list-filter";

/**
 * Stakeholders toolbar: debounced search + engagement-level filter + view
 * toggle (passed as children by DataView's renderToolbar). Project scope
 * comes from the route  — no project filter here.
 */
export function StakeholdersToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="stakeholders-search" />
      <ListFilter
        list="stakeholder.engagement-level"
        param="engagement"
        label={messages.stakeholders.engagementLevel}
        allLabel={messages.stakeholders.allEngagementLevels}
        testId="filter-engagement"
      />

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
