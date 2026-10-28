"use client";
import { BOARD_SORT, defaultBoardColumns } from "../schemas/board-rules";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataView } from "@/components/ui/data-view/data-view";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { ProjectFilter } from "@/components/ui/data-view/project-filter";
import { Toolbar } from "@/components/ui/toolbar";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { listEmptyState } from "@/components/ui/states";
import type { BoardListRow } from "../schemas/board";
import type { ProjectOption } from "@/modules/projects/project-options";
import { createBoardAction } from "../actions";
import { BoardForm, BoardField } from "./board-form";
import { Input, Textarea } from "@/components/ui/form/inputs";
import { Combobox } from "@/components/ui/form/combobox";
import { boardFormSchema } from "../schemas/board-form";
import { createBoardInput } from "../schemas/board";
import { BOARD_NAME_MAX, BOARD_DESCRIPTION_MAX } from "../schemas/board-rules";
const M = messages.boards;
export function BoardsList({
  rows,
  page,
  projects,
  projectId = null,
  scoped = false,
  allowCreate = true,
}: {
  rows: BoardListRow[];
  page: number;
  projects: ProjectOption[];
  projectId?: number | null;
  scoped?: boolean;
  allowCreate?: boolean;
}) {
  const router = useRouter();
  const { searchParams } = useListUrlState();
  const filtersActive = Boolean(searchParams.get("q") || (!scoped && searchParams.get("project")));
  const [creating, setCreating] = useState(false);
  const boardHref = (id: number) =>
    scoped ? `/projects/${projectId}/boards/${id}` : `/boards/${id}`;
  const add = allowCreate ? (
    <Button onClick={() => setCreating(true)}>{M.newBoard}</Button>
  ) : undefined;
  return (
    <>
      <header className="flex items-center justify-end gap-3 py-4">{add}</header>
      <DataView
        moduleKey="boards"
        rows={rows}
        totalCount={rows[0]?.TotalCount ?? 0}
        page={page}
        initialView="grid"
        getRowId={(r) => r.BoardId}
        getRowLabel={(r) => r.Name}
        onOpen={(r) => router.push(boardHref(r.BoardId))}
        renderCard={(r) => (
          <div>
            <Link className="text-lg font-semibold text-accent" href={boardHref(r.BoardId)}>
              {r.Name}
            </Link>
            <p className="text-sm text-ink-muted">{r.ProjectName ?? M.noProject}</p>
            <p className="mt-2 line-clamp-3">{r.Description}</p>
          </div>
        )}
        columns={[
          {
            key: "Name",
            header: M.name,
            priority: 1,
            render: (r) => (
              <Link className="text-accent underline" href={boardHref(r.BoardId)}>
                {r.Name}
              </Link>
            ),
          },
          {
            key: "ProjectName",
            header: M.project,
            priority: 2,
            render: (r) => r.ProjectName ?? M.noProject,
          },
        ]}
        sort={BOARD_SORT}
        filtersActive={filtersActive}
        renderToolbar={(toggle) => (
          <Toolbar>
            <SearchInput />
            {!scoped ? <ProjectFilter options={projects} /> : null}
            {toggle}
          </Toolbar>
        )}
        empty={listEmptyState(filtersActive, M.ui.empty, add)}
      />
      {creating ? (
        <BoardForm
          title={M.newBoard}
          close={() => setCreating(false)}
          schema={boardFormSchema(createBoardInput, { columns: defaultBoardColumns() })}
          save={createBoardAction}
          onSaved={(created) => router.push(boardHref(created.BoardId))}
        >
          <BoardField name="name" label={M.name}>
            <Input name="name" required maxLength={BOARD_NAME_MAX} autoFocus />
          </BoardField>
          <BoardField name="description" label={M.description}>
            <Textarea name="description" maxLength={BOARD_DESCRIPTION_MAX} />
          </BoardField>
          <BoardField name="projectId" label={M.project}>
            <Combobox
              name="projectId"
              defaultValue={String(projectId ?? "")}
              options={[
                { value: "", label: M.noProject },
                ...projects.map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </BoardField>
        </BoardForm>
      ) : null}
    </>
  );
}
