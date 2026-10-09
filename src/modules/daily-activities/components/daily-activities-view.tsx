"use client";

import { Badge } from "@/components/ui/badge";
import { DataView } from "@/components/ui/data-view/data-view";
import {
  dateColumn,
  listColumn,
  projectColumn,
  textColumn,
} from "@/components/ui/data-view/columns";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { ProjectPicker } from "@/modules/projects/project-options";
import { createDailyActivityAction, updateDailyActivityAction } from "../actions";
import type { DailyActivityListRow, DailyActivityRow } from "../schemas/daily-activity";
import { dailyActivityFormValues } from "../schemas/daily-activity-form";
import { DailyActivitiesToolbar } from "./daily-activities-toolbar";

type Row = DailyActivityListRow;

const M = messages.dailyActivities;
const P = M.placeholders;

/**
 * The datasheet columns in the client's order (daily-activity column spec):
 * Project name, Requester, Request date, Contact method, Task or comments, My
 * activity or response received, My date, Status, Comments, Completed date.
 * Task type, progress, time spent and assigned-to stay in the record sheet.
 * Users can still rearrange them (ADR-0023); this is the default.
 */
function buildColumns(projects: ProjectPicker): DataViewColumn<Row>[] {
  return [
    projectColumn<Row>({ priority: 1, ...projects }),
    textColumn({
      key: "Requester",
      header: M.requester,
      priority: 2,
      field: "requester",
      value: (r) => r.Requester,
      placeholder: P.requester,
      maxLength: 255,
    }),
    dateColumn({
      key: "RequestDate",
      header: M.requestDate,
      priority: 2,
      field: "requestDate",
      value: (r) => r.RequestDate,
      placeholder: P.date,
    }),
    listColumn({
      key: "ContactMethod",
      header: M.contactMethod,
      priority: 2,
      field: "contactMethod",
      list: "daily-activity.contact-method",
      value: (r) => r.ContactMethod,
      placeholder: P.contactMethod,
      render: (r) => r.ContactMethod,
    }),
    textColumn({
      key: "Task",
      header: M.columns.task,
      priority: 1,
      field: "task",
      value: (r) => r.Task,
      placeholder: P.task,
    }),
    textColumn({
      key: "MyActivity",
      header: M.columns.myActivity,
      priority: 2,
      field: "myActivity",
      value: (r) => r.MyActivity,
      placeholder: P.myActivity,
    }),
    dateColumn({
      key: "ActivityDate",
      header: M.columns.activityDate,
      priority: 3,
      field: "activityDate",
      value: (r) => r.ActivityDate,
      placeholder: P.date,
    }),
    listColumn({
      key: "ActivityStatus",
      header: M.activityStatus,
      priority: 1,
      field: "activityStatusId",
      list: "daily-activity.status",
      value: (r) => r.ActivityStatusId,
      currentLabel: (r) => r.ActivityStatus,
      placeholder: P.status,
    }),
    textColumn({
      key: "Comments",
      header: M.comments,
      priority: 3,
      field: "comments",
      value: (r) => r.Comments,
      placeholder: P.comments,
    }),
    dateColumn({
      key: "CompleteDate",
      header: M.columns.completeDate,
      priority: 3,
      field: "completeDate",
      value: (r) => r.CompleteDate,
      placeholder: P.date,
    }),
  ];
}

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, DailyActivityRow>(
  dailyActivityFormValues,
  updateDailyActivityAction,
);
const canEditRow = rowAllows("daily-activities:update");

/**
 * Daily Activities list: DataView; opening a row syncs ?id= (sheet). List view
 * is a datasheet (ADR-0023): each row is editable per its own project access
 * (ActorAccess), including its project; the new-entry row adds to the project
 * its Project cell names (the route's or the filtered one by default).
 */
export function DailyActivitiesView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projects,
  projectFilterOptions,
  canCreate,
  newActivityAction,
}: {
  rows: Row[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** The Project column: where the actor may put an activity, and the new-entry row's project. */
  projects: ProjectPicker;
  /** The cross-project page's project filter; omitted on a project page (the route scopes it). */
  projectFilterOptions?: readonly { id: number; name: string }[];
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
      initialLayout={layout}
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
          {row.ProjectName ? <p className="text-xs text-ink-muted">{row.ProjectName}</p> : null}
          {row.Requester ? <p className="text-xs text-ink-muted">{row.Requester}</p> : null}
          {row.RequestDate ? (
            <p className="text-xs text-ink-muted">{formatDate(row.RequestDate)}</p>
          ) : null}
        </div>
      )}
      columns={buildColumns(projects)}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate ? { add: (values) => createDailyActivityAction(values) } : undefined,
      }}
      renderToolbar={(viewToggle) => (
        <DailyActivitiesToolbar projectFilterOptions={projectFilterOptions}>
          {viewToggle}
        </DailyActivitiesToolbar>
      )}
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
