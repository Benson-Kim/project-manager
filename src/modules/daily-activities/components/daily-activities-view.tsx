"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import {
  dateColumn,
  listColumn,
  numberColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { formCellSaver, formText } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createDailyActivityAction, updateDailyActivityAction } from "../actions";
import type { DailyActivityListRow, DailyActivityRow } from "../schemas/daily-activity";
import { dailyActivityFormValues } from "../schemas/daily-activity-form";
import { DailyActivitiesToolbar } from "./daily-activities-toolbar";

type Row = DailyActivityListRow;

const P = messages.dailyActivities.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "Task",
    header: messages.dailyActivities.task,
    priority: 1,
    field: "task",
    value: (r) => r.Task,
    placeholder: P.task,
  }),
  listColumn({
    key: "ActivityStatus",
    header: messages.dailyActivities.activityStatus,
    priority: 1,
    field: "activityStatusId",
    list: "daily-activity.status",
    value: (r) => r.ActivityStatusId,
    currentLabel: (r) => r.ActivityStatus,
    placeholder: P.status,
  }),
  dateColumn({
    key: "RequestDate",
    header: messages.dailyActivities.requestDate,
    priority: 2,
    field: "requestDate",
    value: (r) => r.RequestDate,
    placeholder: P.date,
  }),
  textColumn({
    key: "Requester",
    header: messages.dailyActivities.requester,
    priority: 2,
    field: "requester",
    value: (r) => r.Requester,
    placeholder: P.requester,
    maxLength: 255,
  }),
  listColumn({
    key: "ContactMethod",
    header: messages.dailyActivities.contactMethod,
    priority: 2,
    field: "contactMethod",
    list: "daily-activity.contact-method",
    value: (r) => r.ContactMethod,
    placeholder: P.contactMethod,
    render: (r) => r.ContactMethod,
  }),
  listColumn({
    key: "TaskType",
    header: messages.dailyActivities.taskType,
    priority: 2,
    field: "taskType",
    list: "daily-activity.task-type",
    value: (r) => r.TaskType,
    placeholder: P.taskType,
  }),
  numberColumn({
    key: "Progress",
    header: messages.dailyActivities.progress,
    priority: 3,
    field: "progress",
    value: (r) => r.Progress,
    placeholder: P.progress,
    min: 0,
    max: 100,
    render: (r) =>
      r.Progress !== null ? `${r.Progress} ${messages.dailyActivities.progressSuffix}` : null,
  }),
  numberColumn({
    key: "TimeSpent",
    header: messages.dailyActivities.timeSpent,
    priority: 3,
    field: "timeSpent",
    value: (r) => r.TimeSpent,
    placeholder: P.timeSpent,
    min: 0,
    max: 9999,
    render: (r) =>
      r.TimeSpent !== null ? `${r.TimeSpent} ${messages.dailyActivities.timeSpentSuffix}` : null,
  }),
  textColumn({
    key: "AssignedTo",
    header: messages.dailyActivities.assignedTo,
    priority: 3,
    field: "assignedTo",
    value: (r) => r.AssignedTo,
    placeholder: P.assignedTo,
    maxLength: 255,
  }),
];

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, DailyActivityRow>(
  dailyActivityFormValues,
  updateDailyActivityAction,
);
const canEditRow = rowAllows("daily-activities:update");

/**
 * Daily Activities list: DataView; opening a row syncs ?id= (sheet). List view
 * is a datasheet (ADR-0023): on the cross-project page each row is editable
 * per its own project access (ActorAccess); the new-entry row adds to this
 * project, or project-less on the global page.
 */
export function DailyActivitiesView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  projectId,
  canCreate,
  newActivityAction,
}: {
  rows: Row[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  /** The project the new-entry row adds to; null on the global page (project-less). */
  projectId: number | null;
  canCreate: boolean;
  newActivityAction?: React.ReactNode;
}) {
  const { update } = useListUrlState();

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
            <Badge value={row.ActivityStatus} />
            {row.TaskType ? <Badge value={row.TaskType} /> : null}
          </div>
          {row.Requester ? <p className="text-xs text-ink-muted">{row.Requester}</p> : null}
          {row.RequestDate ? (
            <p className="text-xs text-ink-muted">{formatDate(row.RequestDate)}</p>
          ) : null}
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) =>
                createDailyActivityAction({ ...values, projectId: formText(projectId) }),
            }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <DailyActivitiesToolbar>{viewToggle}</DailyActivitiesToolbar>}
      empty={
        filtersActive ? (
          <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
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
