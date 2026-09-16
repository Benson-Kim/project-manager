"use client";

import { useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { DELIVERABLE_PRIORITIES, DELIVERABLE_STATUSES } from "../schemas/key-deliverable";

/**
 * Deliverables toolbar: search over the requirement text plus status and
 * priority filters, forwarded 1:1 to usp_KeyDeliverable_List (ADR-0016).
 */
export function DeliverablesToolbar() {
  const { searchParams, update } = useListUrlState();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  return (
    <Toolbar>
      <form
        role="search"
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: query || null });
        }}
      >
        <label>
          <span className="sr-only">{messages.list.search}</span>
          <input
            type="search"
            placeholder={messages.list.search}
            data-testid="deliverables-search"
            autoComplete="off"
            className="min-h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => update({ q: query || null })}
          />
        </label>
      </form>
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
    </Toolbar>
  );
}
