"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView } from "../schemas/board-view";
import type { RequirementOption } from "@/modules/requirements/schemas/requirement";
import type { BoardOptionRow } from "../schemas/board";
import {
  packageRequirementsAction,
  readPackagingBoardAction,
  readPackagingOptionsAction,
} from "../actions";
import { BoardForm, BoardField, control, text } from "./board-form";
const M = messages.boards;
const U = M.ui;
export function PackageRequirementsButton({
  projectId,
  projects = [],
  board,
  selectedIds,
}: {
  projectId?: number;
  projects?: ProjectOption[];
  board?: BoardView;
  selectedIds?: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(
    projectId ?? board?.header.ProjectId ?? projects[0]?.id ?? 0,
  );
  const [boardId, setBoardId] = useState(board?.header.BoardId ?? 0);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [boards, setBoards] = useState<BoardOptionRow[]>([]);
  const [columns, setColumns] = useState(board?.columns ?? []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!open || !project) return;
    let active = true;
    readPackagingOptionsAction({ projectId: project })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRequirements(result.data.requirements);
          setBoards(result.data.boards);
        } else setError(result.error.message);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(messages.errors.INTERNAL);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, project]);
  useEffect(() => {
    if (!open || !boardId || board) return;
    let active = true;
    readPackagingBoardAction({ boardId })
      .then((result) => {
        if (active) {
          if (result.ok) setColumns(result.data.columns);
          else setError(result.error.message);
        }
      })
      .catch(() => {
        if (active) setError(messages.errors.INTERNAL);
      });
    return () => {
      active = false;
    };
  }, [boardId, open, board]);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError("");
          setLoading(true);
          setRequirements([]);
          setSearch("");
          setOpen(true);
        }}
      >
        {U.packageTitle}
      </Button>
      {open ? (
        <BoardForm
          title={U.packageTitle}
          close={() => setOpen(false)}
          save={async (data) => {
            const result = await packageRequirementsAction({
              boardId,
              boardColumnId: Number(text(data, "column")),
              boardSprintId: board?.header.ActiveSprintId,
              requirementIds: data.getAll("requirements").map(Number),
            });
            if (result.ok) {
              router.refresh();
              if (!board) router.push(`/boards/${boardId}`);
            }
            return result;
          }}
        >
          {!projectId && board?.header.ProjectId === null ? (
            <BoardField label={M.project}>
              <select
                className={control}
                value={project}
                onChange={(e) => {
                  setLoading(true);
                  setError("");
                  setProject(Number(e.target.value));
                  setRequirements([]);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </BoardField>
          ) : null}
          {!board ? (
            <BoardField label={M.name}>
              <select
                className={control}
                value={boardId || ""}
                required
                onChange={(e) => {
                  setColumns([]);
                  setBoardId(Number(e.target.value));
                }}
              >
                <option value="" disabled>
                  {U.open}
                </option>
                {boards.map((b) => (
                  <option key={b.BoardId} value={b.BoardId}>
                    {b.Name} · {b.ProjectName ?? M.noProject}
                  </option>
                ))}
              </select>
            </BoardField>
          ) : null}
          <BoardField label={U.column}>
            <select className={control} name="column" required key={boardId}>
              {columns.map((c) => (
                <option key={c.BoardColumnId} value={c.BoardColumnId}>
                  {c.Name}
                </option>
              ))}
            </select>
          </BoardField>
          <BoardField label={U.requirements}>
            <input
              className={control}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </BoardField>
          {loading ? <p role="status">{U.loading}</p> : null}
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
          <div className="max-h-60 overflow-y-auto">
            {!loading &&
            !error &&
            !requirements.some((r) =>
              `${r.ref} ${r.text}`.toLowerCase().includes(search.toLowerCase()),
            ) ? (
              <p role="status">{U.noRequirements}</p>
            ) : null}
            {requirements.map((r) => (
              <label
                key={`${project}-${r.id}`}
                className={`min-h-11 items-center gap-2 border-b border-line py-2 ${!`${r.ref} ${r.text}`.toLowerCase().includes(search.toLowerCase()) ? "hidden" : "flex"}`}
              >
                <input
                  type="checkbox"
                  name="requirements"
                  value={r.id}
                  defaultChecked={selectedIds?.includes(r.id)}
                />
                <span>
                  {r.ref} · {r.text}
                </span>
              </label>
            ))}
          </div>
        </BoardForm>
      ) : null}
    </>
  );
}
