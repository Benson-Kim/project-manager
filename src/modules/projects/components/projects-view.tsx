"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { listEmptyState } from "@/components/ui/states";
import { DataView } from "@/components/ui/data-view/data-view";
import type { DataViewColumn } from "@/components/ui/data-view/types";

import { formatDate } from "@/lib/format";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";

import type { ProjectListRow } from "../schemas/project";

import { ProjectsToolbar } from "./projects-toolbar";

function dateRange(row: ProjectListRow): string {
  const start = formatDate(row.StartDate);
  const end = formatDate(row.EndDate);
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return null;

  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-xs font-medium leading-none text-ink">
      {value}
    </span>
  );
}

function PriorityBadge({ value }: { value: string | null }) {
  if (!value) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
      {value}
    </span>
  );
}

const columns: DataViewColumn<ProjectListRow>[] = [
  {
    key: "ProjectName",
    header: messages.projects.name,
    priority: 1,
    render: (r) => <span className="font-medium text-ink">{r.ProjectName}</span>,
  },
  {
    key: "ProjectStatus",
    header: messages.projects.status,
    priority: 1,
    render: (r) => <StatusBadge value={r.ProjectStatus} />,
  },
  {
    key: "ProjectPriority",
    header: messages.projects.priority,
    priority: 2,
    render: (r) => <PriorityBadge value={r.ProjectPriority} />,
  },
  {
    key: "ProjectManager",
    header: messages.projects.manager,
    priority: 2,
    render: (r) =>
      r.ProjectManager ? (
        <span className="text-ink">{r.ProjectManager}</span>
      ) : (
        <span className="text-ink-faint">—</span>
      ),
  },
  {
    key: "StartDate",
    header: messages.projects.startDate,
    priority: 3,
    render: (r) => (
      <span className="whitespace-nowrap tabular-nums text-ink-muted">
        {formatDate(r.StartDate) || "—"}
      </span>
    ),
  },
  {
    key: "EndDate",
    header: messages.projects.endDate,
    priority: 3,
    render: (r) => (
      <span className="whitespace-nowrap tabular-nums text-ink-muted">
        {formatDate(r.EndDate) || "—"}
      </span>
    ),
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
      renderToolbar={(viewToggle) => (
        <ProjectsToolbar>
          <div className="ml-auto shrink-0">{viewToggle}</div>
        </ProjectsToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.projects.emptyBody, newProjectAction)}
    />
  );
}
