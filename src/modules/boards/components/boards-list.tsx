"use client";
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
import { BoardForm, BoardField, control, text, optionalNumber } from "./board-form";
const M = messages.boards;
export function BoardsList({
  rows,
  page,
  projects,
  projectId = null,
}: {
  rows: BoardListRow[];
  page: number;
  projects: ProjectOption[];
  projectId?: number | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const add = <Button onClick={() => setCreating(true)}>{M.newBoard}</Button>;
  return (
    <>
      <header className="flex items-center justify-between gap-3 py-4">
        <h1 className="text-xl font-semibold">{M.title}</h1>
        {add}
      </header>
      <DataView
        moduleKey="boards"
        rows={rows}
        totalCount={rows[0]?.TotalCount ?? 0}
        page={page}
        initialView="grid"
        getRowId={(r) => r.BoardId}
        getRowLabel={(r) => r.Name}
        onOpen={(r) => router.push(`/boards/${r.BoardId}`)}
        renderCard={(r) => (
          <div>
            <Link className="text-lg font-semibold text-accent" href={`/boards/${r.BoardId}`}>
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
              <Link className="text-accent underline" href={`/boards/${r.BoardId}`}>
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
        sort={{ columns: ["Name", "ProjectName", "UpdatedAtUtc"], default: "Name" }}
        filtersActive={false}
        renderToolbar={(toggle) => (
          <Toolbar>
            <SearchInput />
            {projectId === null ? <ProjectFilter options={projects} /> : null}
            {toggle}
          </Toolbar>
        )}
        empty={listEmptyState(false, M.ui.empty, add)}
      />
      {creating ? (
        <BoardForm
          title={M.newBoard}
          close={() => setCreating(false)}
          save={async (data) => {
            const result = await createBoardAction({
              name: text(data, "name"),
              description: text(data, "description"),
              projectId: optionalNumber(data, "project"),
              columns: [
                { name: M.defaultColumns.todo, category: "todo", wipLimit: null },
                { name: M.defaultColumns.doing, category: "doing", wipLimit: null },
                { name: M.defaultColumns.done, category: "done", wipLimit: null },
              ],
            });
            if (result.ok) router.push(`/boards/${result.data.BoardId}`);
            return result;
          }}
        >
          <BoardField label={M.name}>
            <input className={control} name="name" required maxLength={200} autoFocus />
          </BoardField>
          <BoardField label={M.description}>
            <textarea className={control} name="description" maxLength={2000} />
          </BoardField>
          <BoardField label={M.project}>
            <select className={control} name="project" defaultValue={projectId ?? ""}>
              <option value="">{M.noProject}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </BoardField>
        </BoardForm>
      ) : null}
    </>
  );
}
