"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataView } from "@/components/ui/data-view/data-view";
import { ProjectFilter } from "@/components/ui/data-view/project-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { listEmptyState } from "@/components/ui/states";
import { Toolbar } from "@/components/ui/toolbar";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { noteHref } from "../note-links";
import type { NoteListRow } from "../schemas/note";

const M = messages.notes;

/**
 * Notes list: a read-only DataView of notebooks; the title opens the workspace.
 * On the cross-project page (/notes) it adds the Project column and filter.
 */
export function NotesView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectFilterOptions,
  emptyBody = M.emptyBody,
  newItemAction,
}: {
  rows: NoteListRow[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  layout?: ListLayout | null;
  filtersActive: boolean;
  /** The projects of the cross-project page's filter; omitted on a project page. */
  projectFilterOptions?: readonly { id: number; name: string }[];
  emptyBody?: string;
  newItemAction?: React.ReactNode;
}) {
  const router = useRouter();
  const label = (row: NoteListRow) => row.Title ?? M.untitled;

  const columns: DataViewColumn<NoteListRow>[] = [
    {
      key: "Title",
      header: M.notebookTitle,
      priority: 1,
      render: (r) => (
        <Link href={noteHref(r)} className="font-medium text-accent underline">
          {label(r)}
        </Link>
      ),
    },
    ...(projectFilterOptions
      ? [
          {
            key: "ProjectName",
            header: messages.projectPicker.header,
            priority: 2 as const,
            render: (r: NoteListRow) => r.ProjectName ?? messages.projectPicker.none,
          },
        ]
      : []),
    { key: "TabCount", header: M.pageCount, priority: 2, render: (r) => r.TabCount },
    {
      key: "LastEditedAtUtc",
      header: M.lastEdited,
      priority: 2,
      render: (r) => <span className="whitespace-nowrap">{formatDate(r.LastEditedAtUtc)}</span>,
    },
  ];

  return (
    <DataView
      moduleKey="notes"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      initialLayout={layout}
      getRowId={(row) => row.NoteId}
      getRowLabel={label}
      filtersActive={filtersActive}
      onOpen={(row) => router.push(noteHref(row))}
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold text-ink">{label(row)}</p>
          {projectFilterOptions ? (
            <p className="text-xs text-ink-muted">
              {row.ProjectName ?? messages.projectPicker.none}
            </p>
          ) : null}
          <p className="text-sm text-ink-muted">
            {`${row.TabCount} ${M.pageCount.toLowerCase()} · ${formatDate(row.LastEditedAtUtc)}`}
          </p>
        </div>
      )}
      columns={columns}
      renderToolbar={(viewToggle) => (
        <Toolbar>
          <SearchInput testId="notes-search" />
          {projectFilterOptions ? <ProjectFilter options={projectFilterOptions} /> : null}
          {viewToggle}
        </Toolbar>
      )}
      empty={listEmptyState(filtersActive, emptyBody, newItemAction)}
    />
  );
}
