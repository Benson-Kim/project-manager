"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { listEmptyState } from "@/components/ui/states";
import { dateColumn, listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";

import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";

import { createProjectAction, updateProjectAction } from "../actions";
import type { ProjectListRow, ProjectRow } from "../schemas/project";
import { projectFormValues } from "../schemas/project-form";

import { ProjectsToolbar } from "./projects-toolbar";

function dateRange(row: ProjectListRow): string {
  const start = formatDate(row.StartDate);
  const end = formatDate(row.EndDate);
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
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

type Row = ProjectListRow;
const P = messages.projects.placeholders;

const dateCell = (value: Date | null) => (
  <span className="whitespace-nowrap tabular-nums text-ink-muted">{formatDate(value) || "—"}</span>
);

const columns: DataViewColumn<Row>[] = [
  textColumn({
    key: "ProjectName",
    header: messages.projects.name,
    priority: 1,
    field: "projectName",
    value: (r) => r.ProjectName,
    placeholder: P.name,
    maxLength: 255,
    render: (r) => <span className="font-medium text-ink">{r.ProjectName}</span>,
  }),
  listColumn({
    key: "ProjectStatus",
    header: messages.projects.status,
    priority: 1,
    field: "projectStatus",
    list: "project.status",
    value: (r) => r.ProjectStatus,
    placeholder: P.status,
    render: (r) => <StatusBadge value={r.ProjectStatus} />,
  }),
  listColumn({
    key: "ProjectPriority",
    header: messages.projects.priority,
    priority: 2,
    field: "projectPriority",
    list: "project.priority",
    value: (r) => r.ProjectPriority,
    placeholder: P.priority,
    render: (r) => <PriorityBadge value={r.ProjectPriority} />,
  }),
  textColumn({
    key: "ProjectManager",
    header: messages.projects.manager,
    priority: 2,
    field: "projectManager",
    value: (r) => r.ProjectManager,
    placeholder: P.manager,
    maxLength: 255,
    render: (r) =>
      r.ProjectManager ? (
        <span className="text-ink">{r.ProjectManager}</span>
      ) : (
        <span className="text-ink-faint">—</span>
      ),
  }),
  dateColumn({
    key: "StartDate",
    header: messages.projects.startDate,
    priority: 3,
    field: "startDate",
    value: (r) => r.StartDate,
    placeholder: P.startDate,
    render: (r) => dateCell(r.StartDate),
  }),
  dateColumn({
    key: "EndDate",
    header: messages.projects.endDate,
    priority: 3,
    field: "endDate",
    value: (r) => r.EndDate,
    placeholder: P.endDate,
    render: (r) => dateCell(r.EndDate),
  }),
];

/** Datasheet edits go through the same update action as the charter. */
const saveCell = formCellSaver<Row, ProjectRow>(projectFormValues, updateProjectAction);
const canEditRow = rowAllows("projects:update");

/**
 * Projects list: each row opens the project workspace. List view is a
 * datasheet: Managers edit their projects' cells in place, and any
 * user adds a project from the new-entry row (they become its Manager).
 */
export function ProjectsView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  canCreate,
  newProjectAction,
}: {
  rows: ProjectListRow[];
  /** Shows the datasheet's new-entry row. */
  canCreate: boolean;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  /** The user's saved datasheet layout (DataView initialLayout). */
  layout?: ListLayout | null;
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
      initialLayout={layout}
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
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate ? { add: (values) => createProjectAction(values) } : undefined,
      }}
      renderToolbar={(viewToggle) => (
        <ProjectsToolbar>
          <div className="ml-auto shrink-0">{viewToggle}</div>
        </ProjectsToolbar>
      )}
      empty={listEmptyState(filtersActive, messages.projects.emptyBody, newProjectAction)}
    />
  );
}
