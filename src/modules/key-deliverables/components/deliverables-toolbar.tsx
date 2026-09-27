"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { DELIVERABLE_PRIORITIES, DELIVERABLE_STATUSES } from "../schemas/key-deliverable";

/**
 * Deliverables toolbar: search over the requirement text plus status and
 * priority filters, forwarded 1:1 to usp_KeyDeliverable_List .
 * Search uses the shared SearchInput which debounces on change and flushes
 * immediately on blur — covering both "type and wait" and "type then submit".
 */
export function DeliverablesToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();

  return (
    <Toolbar>
      <SearchInput testId="deliverables-search" />
      <label>
        <span className="sr-only">{messages.keyDeliverables.status}</span>
        <Select
          name="status"
          data-testid="filter-status"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.keyDeliverables.allStatuses}</option>
          {DELIVERABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="sr-only">{messages.keyDeliverables.priority}</span>
        <Select
          name="priority"
          data-testid="filter-priority"
          value={searchParams.get("priority") ?? ""}
          onChange={(e) => update({ priority: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.keyDeliverables.allPriorities}</option>
          {DELIVERABLE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>
      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
