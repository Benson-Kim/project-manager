"use client";

import { useRouter } from "next/navigation";
import { dateColumn, richTextColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver, type RichCellView } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { listEmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { createMeetingAction, updateMeetingAction } from "../actions";
import type { MeetingListRow, MeetingRow } from "../schemas/meeting";
import { attendanceSummary, meetingTimes } from "../schemas/meeting-display";
import { meetingFormValues } from "../schemas/meeting-form";
import { MeetingsToolbar } from "./meetings-toolbar";

/** A list row with its Objective as the server rendered it (the sanitiser stays on the server). */
export type MeetingListItem = MeetingListRow & { views: { Objective: RichCellView } };

type Row = MeetingListItem;
const M = messages.meetings;
const P = M.placeholders;

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "Subject",
    header: M.subject,
    priority: 1,
    field: "subject",
    value: (r) => r.Subject,
    placeholder: P.subject,
    maxLength: 255,
    render: (r) => r.Subject ?? <span className="text-ink-muted">{messages.app.untitled}</span>,
  }),
  dateColumn({
    key: "StartDate",
    header: M.startDate,
    priority: 1,
    field: "startDate",
    value: (r) => r.StartDate,
    placeholder: P.startDate,
  }),
  {
    key: "Time",
    header: M.time,
    priority: 2,
    render: (r) => (
      <span className="whitespace-nowrap">{meetingTimes(r.StartTime, r.EndTime)}</span>
    ),
  },
  textColumn({
    key: "Location",
    header: M.location,
    priority: 2,
    field: "location",
    value: (r) => r.Location,
    placeholder: P.location,
    maxLength: 255,
  }),
  {
    key: "Attendees",
    header: M.attendees,
    priority: 2,
    render: (r) => (
      <span className="whitespace-nowrap">
        {attendanceSummary(r.AttendeeCount, r.ApologyCount)}
      </span>
    ),
  },
  richTextColumn({
    key: "Objective",
    header: M.objective,
    priority: 3,
    field: "objective",
    value: (r) => r.Objective,
    placeholder: P.objective,
    view: (r) => r.views.Objective,
  }),
];

/** Datasheet edits go through the same update action as the workspace header (ADR-0023). */
const saveCell = formCellSaver<Row, MeetingRow>(meetingFormValues, updateMeetingAction);
const canEditRow = rowAllows("meetings:update");

/**
 * Meetings list (module #10): a datasheet, newest first; a row opens the
 * meeting's workspace page (ADR-0010 full-route exception).
 */
export function MeetingsView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  canCreate,
  newItemAction,
}: {
  rows: MeetingListItem[];
  projectId: number;
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  layout?: ListLayout | null;
  filtersActive: boolean;
  newItemAction?: React.ReactNode;
}) {
  const router = useRouter();
  const open = (row: Row) => router.push(`/projects/${projectId}/meetings/${row.MeetingId}`);

  return (
    <DataView
      moduleKey="meetings"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      getRowId={(row) => row.MeetingId}
      getRowLabel={(row) => row.Subject ?? messages.app.untitled}
      filtersActive={filtersActive}
      onOpen={open}
      renderCard={(row) => {
        const times = meetingTimes(row.StartTime, row.EndTime);
        const attendance = attendanceSummary(row.AttendeeCount, row.ApologyCount);
        return (
          <div className="flex flex-col gap-1.5">
            <p className="line-clamp-2 text-sm font-semibold text-ink">
              {row.Subject ?? messages.app.untitled}
            </p>
            <p className="text-sm text-ink-muted">
              {[formatDate(row.StartDate), times, row.Location].filter(Boolean).join(" · ")}
            </p>
            {attendance ? <p className="text-sm text-ink-muted">{attendance}</p> : null}
            {row.views.Objective.html === row.Objective && row.Objective ? (
              <div className="line-clamp-3 text-sm text-ink">{row.views.Objective.node}</div>
            ) : null}
          </div>
        );
      }}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) => createMeetingAction({ ...values, projectId: String(projectId) }),
            }
          : undefined,
      }}
      renderToolbar={(viewToggle) => <MeetingsToolbar>{viewToggle}</MeetingsToolbar>}
      empty={listEmptyState(filtersActive, M.emptyBody, newItemAction)}
    />
  );
}
