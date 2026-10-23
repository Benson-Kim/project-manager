"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataView } from "@/components/ui/data-view/data-view";
import { SearchInput } from "@/components/ui/data-view/search-input";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { listEmptyState } from "@/components/ui/states";
import { Toolbar } from "@/components/ui/toolbar";
import { formatDate } from "@/lib/format";
import type { ListLayout } from "@/lib/list-layout";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import type { NoteListRow } from "../schemas/note";
import { NOTE_SORT } from "../schemas/note";

const M = messages.notes;

/** Notes list: a read-only DataView of notebooks; the title opens the workspace. */
export function NotesView({
  rows,
  totalCount,
  page,
  initialView,
  layout,
  filtersActive,
  projectId,
  newItemAction,
}: {
  rows: NoteListRow[];
  projectId: number;
  totalCount: number;
  page: number;
  initialView: ViewMode;
  layout?: ListLayout | null;
  filtersActive: boolean;
  newItemAction?: React.ReactNode;
}) {
  const router = useRouter();
  const href = (row: NoteListRow) => `/projects/${projectId}/notes/${row.NoteId}`;
  const label = (row: NoteListRow) => row.Title ?? M.untitled;

  const columns: DataViewColumn<NoteListRow>[] = [
    {
      key: "Title",
      header: M.notebookTitle,
      priority: 1,
      render: (r) => (
        <Link href={href(r)} className="font-medium text-accent underline">
          {label(r)}
        </Link>
      ),
    },
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
      onOpen={(row) => router.push(href(row))}
      renderCard={(row) => (
        <div className="flex flex-col gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold text-ink">{label(row)}</p>
          <p className="text-sm text-ink-muted">
            {`${row.TabCount} ${M.pageCount.toLowerCase()} · ${formatDate(row.LastEditedAtUtc)}`}
          </p>
        </div>
      )}
      columns={columns}
      sort={NOTE_SORT}
      renderToolbar={(viewToggle) => (
        <Toolbar>
          <SearchInput testId="notes-search" />
          {viewToggle}
        </Toolbar>
      )}
      empty={listEmptyState(filtersActive, M.emptyBody, newItemAction)}
    />
  );
}
