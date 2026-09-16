"use client";

import { useRouter } from "next/navigation";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { EmptyState } from "@/components/ui/states";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { ProjectListRow } from "../schemas/project";

/** Fixed locale so server and client render identical dates (no hydration drift). */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

function Badge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink">
      {value}
    </span>
  );
}

function dateRange(row: ProjectListRow): string {
  const start = formatDate(row.StartDate);
  const end = formatDate(row.EndDate);
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

const columns: DataViewColumn<ProjectListRow>[] = [
  { key: "ProjectName", header: messages.projects.name, priority: 1, render: (r) => r.ProjectName },
  {
    key: "ProjectStatus",
    header: messages.projects.status,
    priority: 1,
    render: (r) => <Badge value={r.ProjectStatus} />,
  },
  {
    key: "ProjectPriority",
    header: messages.projects.priority,
    priority: 2,
    render: (r) => <Badge value={r.ProjectPriority} />,
  },
  {
    key: "ProjectManager",
    header: messages.projects.manager,
    priority: 2,
    render: (r) => r.ProjectManager,
  },
  {
    key: "StartDate",
    header: messages.projects.startDate,
    priority: 3,
    render: (r) => formatDate(r.StartDate),
  },
  {
    key: "EndDate",
    header: messages.projects.endDate,
    priority: 3,
    render: (r) => formatDate(r.EndDate),
  },
];

export function ProjectsView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  newProjectAction,
}: {
  rows: ProjectListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  newProjectAction?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <DataView
      moduleKey="projects"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.ProjectId}
      getRowLabel={(row) => row.ProjectName}
      onOpen={(row) => router.push(`/projects/${row.ProjectId}`)}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{row.ProjectName}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.ProjectStatus} />
            <Badge value={row.ProjectPriority} />
          </div>
          {row.ProjectManager ? (
            <p className="text-xs text-ink-muted">{row.ProjectManager}</p>
          ) : null}
          {dateRange(row) ? <p className="text-xs text-ink-muted">{dateRange(row)}</p> : null}
        </div>
      )}
      columns={columns}
      empty={
        filtersActive ? (
          <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
        ) : (
          <EmptyState
            title={messages.list.emptyTitle}
            body={messages.projects.emptyBody}
            action={newProjectAction}
          />
        )
      }
    />
  );
}
