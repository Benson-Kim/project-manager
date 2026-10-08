"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Daily Activities toolbar: search + status filter + task-type filter +
 * view toggle (passed as children by DataView's renderToolbar). The filters
 * offer the managed lists (ADR-0022); the status filter carries the option id.
 * Project scope comes from the route.
 */
export function DailyActivitiesToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="daily-activities-search" placeholder={messages.list.search} />
      <ListFilter
        list="daily-activity.status"
        param="statusId"
        label={messages.dailyActivities.activityStatus}
        allLabel={messages.dailyActivities.allStatuses}
        testId="filter-status"
      />
      <ListFilter
        list="daily-activity.task-type"
        param="taskType"
        label={messages.dailyActivities.taskType}
        allLabel={messages.dailyActivities.allTaskTypes}
        testId="filter-task-type"
      />
      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
