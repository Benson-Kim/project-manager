"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";

/**
 * Assumptions & constraints toolbar: search + type filter + view toggle.
 * Filter values sync to URL and are server-read by the list page.
 */
export function AssumptionConstraintToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();
  const type = searchParams.get("type") ?? "";

  return (
    <Toolbar>
      <SearchInput testId="assumption-constraint-search" />
      <select
        key={type}
        aria-label={messages.assumptionsConstraints.allTypes}
        value={type}
        onChange={(e) => update({ type: e.target.value || null, page: null })}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-ink"
      >
        <option value="">{messages.assumptionsConstraints.allTypes}</option>
        <option value="Assumption">{messages.assumptionsConstraints.typeAssumption}</option>
        <option value="Constraint">{messages.assumptionsConstraints.typeConstraint}</option>
      </select>
      {children}
    </Toolbar>
  );
}
