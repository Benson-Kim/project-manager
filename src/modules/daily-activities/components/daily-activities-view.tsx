"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";
import type { ActivityStatus, DailyActivityListRow } from "../schemas/daily-activity";
import { DailyActivitiesToolbar } from "./daily-activities-toolbar";

function statusName(
  statusId: number | null,
  statuses: ActivityStatus[],
): string | null {
  if (statusId === null) return null;
  return statuses.find((s) => s.ActivityStatusId === statusId)?.Name ?? null;
}

/** Returns DataView columns. Statuses injected as a closure so columns are stable. */
function buildColumns(
  statuses: ActivityStatus[],
): DataViewColumn<DailyActivityListRow>[] {
  return [
    {
      key: "Task",
      header: messages.dailyActivities.task,
      priority: 1,
      render: (r) => r.Task,
    },
    {
      key: "ActivityStatus",
      header: messages.dailyActivities.activityStatus,
      priority: 1,
      render: (r) => <Badge value={statusName(r.ActivityStatusId, statuses)} />,
    },
    {
      key: "RequestDate",
      header: messages.dailyActivities.requestDate,
      priority: 2,
      render: (r) => formatDate(r.RequestDate),
    },
    {
      key: "Requester",
      header: messages.dailyActivities.requester,
      priority: 2,
      render: (r) => r.Requester,
    },
    {
      key: "TaskType",
      header: messages.dailyActivities.taskType,
      priority: 2,
      render: (r) => <Badge value={r.TaskType} />,
    },
    {
      key: "Progress",
      header: messages.dailyActivities.progress,
      priority: 3,
      render: (r) =>
        r.Progress !== null ? `${r.Progress} ${messages.dailyActivities.progressSuffix}` : null,
    },
    {
      key: "TimeSpent",
      header: messages.dailyActivities.timeSpent,
      priority: 3,
      render: (r) =>
        r.TimeSpent !== null
          ? `${r.TimeSpent} ${messages.dailyActivities.timeSpentSuffix}`
          : null,
    },
    {
      key: "AssignedTo",
      header: messages.dailyActivities.assignedTo,
      priority: 3,
      render: (r) => r.AssignedTo,
    },
  ];
}

/** Daily Activities list: DataView; opening a row syncs ?id=  sheet). */
export function DailyActivitiesView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  statuses,
  newActivityAction,
}: {
  rows: DailyActivityListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  statuses: ActivityStatus[];
  newActivityAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();
  const columns = buildColumns(statuses);

  return (
    <DataView
      moduleKey="daily-activities"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.DailyActivityId}
      getRowLabel={(row) => row.Task ?? String(row.DailyActivityId)}
      onOpen={(row) => update({ id: String(row.DailyActivityId) })}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">
            {row.Task ?? row.MyActivity ?? messages.app.untitled}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={statusName(row.ActivityStatusId, statuses)} />
            {row.TaskType ? <Badge value={row.TaskType} /> : null}
          </div>
          {row.Requester ? (
            <p className="text-xs text-ink-muted">{row.Requester}</p>
          ) : null}
          {row.RequestDate ? (
            <p className="text-xs text-ink-muted">{formatDate(row.RequestDate)}</p>
          ) : null}
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => (
        <DailyActivitiesToolbar statuses={statuses}>{viewToggle}</DailyActivitiesToolbar>
      )}
      empty={
        filtersActive ? (
          <EmptyState
            title={messages.list.zeroResultsTitle}
            body={messages.list.zeroResultsBody}
          />
        ) : (
          <EmptyState
            title={messages.list.emptyTitle}
            body={messages.dailyActivities.emptyBody}
            action={newActivityAction}
          />
        )
      }
    />
  );
}
