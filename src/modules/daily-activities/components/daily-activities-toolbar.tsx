"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { TASK_TYPES } from "../schemas/daily-activity";
import type { ActivityStatus } from "../schemas/daily-activity";

/**
 * Daily Activities toolbar: search + status filter + task-type filter +
 * view toggle (passed as children by DataView's renderToolbar).
 * Project scope comes from the route .
 */
export function DailyActivitiesToolbar({
  statuses,
  children,
}: {
  statuses: ActivityStatus[];
  children?: React.ReactNode;
}) {
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
          data-testid="daily-activities-search"
          className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>

      {/* Status filter */}
      <label>
        <span className="sr-only">{messages.dailyActivities.activityStatus}</span>
        <Select
          name="statusId"
          data-testid="filter-status"
          value={searchParams.get("statusId") ?? ""}
          onChange={(e) => update({ statusId: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.dailyActivities.allStatuses}</option>
          {statuses.map((s) => (
            <option key={s.ActivityStatusId} value={String(s.ActivityStatusId)}>
              {s.Name}
            </option>
          ))}
        </Select>
      </label>

      {/* Task type filter */}
      <label>
        <span className="sr-only">{messages.dailyActivities.taskType}</span>
        <Select
          name="taskType"
          data-testid="filter-task-type"
          value={searchParams.get("taskType") ?? ""}
          onChange={(e) => update({ taskType: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.dailyActivities.allTaskTypes}</option>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </label>

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
