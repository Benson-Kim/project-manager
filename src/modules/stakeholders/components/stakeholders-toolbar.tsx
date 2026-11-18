"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { ListFilter } from "@/components/ui/data-view/list-filter";
import { buttonClass } from "@/components/ui/button-styles";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Stakeholders toolbar: debounced search, engagement-level filter and CSV export, then the view
 * toggle with print and full screen (passed as children by DataView's renderToolbar). Project scope
 * comes from the route.
 */
export function StakeholdersToolbar({
  projectId,
  children,
}: {
  projectId: number;
  children?: React.ReactNode;
}) {
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
      <a
        href={`/projects/${projectId}/stakeholders/export`}
        download
        data-testid="stakeholders-export-csv"
        className={`${buttonClass("ghost")} min-h-11 print:hidden`}
      >
        {messages.stakeholders.exportCsv}
      </a>
      {children}
    </Toolbar>
  );
}
