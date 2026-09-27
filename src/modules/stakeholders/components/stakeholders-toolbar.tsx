"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";

import { messages } from "@/lib/messages";

import { ENGAGEMENT_LEVELS } from "../schemas/stakeholder";

/**
 * Stakeholders toolbar: debounced search + engagement-level filter + view
 * toggle (passed as children by DataView's renderToolbar). Project scope
 * comes from the route  — no project filter here.
 */
export function StakeholdersToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();

  return (
    <Toolbar>
      <SearchInput testId="stakeholders-search" />
      <label>
        <span className="sr-only">{messages.stakeholders.engagementLevel}</span>
        <Select
          name="engagement"
          data-testid="filter-engagement"
          value={searchParams.get("engagement") ?? ""}
          onChange={(e) => update({ engagement: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.stakeholders.allEngagementLevels}</option>
          {ENGAGEMENT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </label>

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
