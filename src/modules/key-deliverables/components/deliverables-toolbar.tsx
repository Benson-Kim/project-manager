"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Deliverables toolbar: search over the requirement text plus status and
 * priority filters, forwarded 1:1 to usp_KeyDeliverable_List .
 * Search uses the shared SearchInput which debounces on change and flushes
 * immediately on blur — covering both "type and wait" and "type then submit".
 */
export function DeliverablesToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="deliverables-search" />
      <ListFilter
        list="key-deliverable.status"
        param="status"
        label={messages.keyDeliverables.status}
        allLabel={messages.keyDeliverables.allStatuses}
        testId="filter-status"
      />
      <ListFilter
        list="key-deliverable.priority"
        param="priority"
        label={messages.keyDeliverables.priority}
        allLabel={messages.keyDeliverables.allPriorities}
        testId="filter-priority"
      />
      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
