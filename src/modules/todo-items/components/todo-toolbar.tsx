"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { TODO_PRIORITIES, TODO_STATUSES } from "../schemas/todo-item";

/**
 * To-do toolbar: search + status filter + priority filter + view toggle.
 * Project scope comes from the route.
 */
export function TodoToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update({ q: value || null }), 250);
  };

  return (
    <Toolbar>
      {/* Search */}
      <label className="min-w-0 flex-1">
        <span className="sr-only">{messages.list.search}</span>
        <input
          type="search"
          autoComplete="off"
          placeholder={messages.list.search}
          data-testid="todo-search"
          className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>

      {/* Status filter */}
      <label>
        <span className="sr-only">{messages.todoItems.status}</span>
        <Select
          name="status"
          data-testid="filter-status"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.todoItems.allStatuses}</option>
          {TODO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>

      {/* Priority filter */}
      <label>
        <span className="sr-only">{messages.todoItems.priority}</span>
        <Select
          name="priority"
          data-testid="filter-priority"
          value={searchParams.get("priority") ?? ""}
          onChange={(e) => update({ priority: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.todoItems.allPriorities}</option>
          {TODO_PRIORITIES.map((p) => (
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
