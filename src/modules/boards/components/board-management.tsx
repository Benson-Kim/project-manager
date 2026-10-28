"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView } from "../schemas/board-view";
import * as actions from "../actions";
import { BoardForm, BoardField, control, text, optionalNumber } from "./board-form";
import { isoDate } from "./board-form";
import type { ActionResult } from "@/lib/action";
const M = messages.boards;
const U = M.ui;
type Mode = {
  kind:
    | "board"
    | "link"
    | "delete-board"
    | "column"
    | "delete-column"
    | "phase"
    | "delete-phase"
    | "sprint"
    | "delete-sprint"
    | "complete";
  id?: number;
};
export function BoardManagement({
  board,
  projects,
}: {
  board: BoardView;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const edit = rowAllows("boards:update")(board.header),
    create = rowAllows("boards:create")(board.header),
    remove = rowAllows("boards:delete")(board.header);
  function run(work: () => Promise<ActionResult<unknown>>) {
    setError("");
    start(async () => {
      const result = await work();
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }
  const column = board.columns.find((c) => c.BoardColumnId === mode?.id);
  const phase = board.phases.find((p) => p.BoardPhaseId === mode?.id);
  const sprint = board.sprints.find((s) => s.BoardSprintId === mode?.id);
  const title =
    mode?.kind === "board"
      ? U.settings
      : mode?.kind === "link"
        ? U.link
        : mode?.kind === "delete-board"
          ? M.deleteTitle
          : mode?.kind === "column"
            ? column
              ? U.editColumn
              : U.newColumn
            : mode?.kind === "delete-column"
              ? M.deleteColumnTitle
              : mode?.kind === "phase"
                ? phase
                  ? U.editPhase
                  : M.newPhase
                : mode?.kind === "delete-phase"
                  ? M.deletePhaseTitle
                  : mode?.kind === "sprint"
                    ? sprint
                      ? U.editSprint
                      : M.newSprint
                    : mode?.kind === "delete-sprint"
                      ? M.deleteSprintTitle
                      : M.completeSprintTitle;
  async function save(data: FormData): Promise<ActionResult<unknown>> {
    if (!mode) return { ok: true, data: null };
    let result: ActionResult<unknown>;
    switch (mode.kind) {
      case "board":
        result = await actions.updateBoardAction({
          boardId: board.header.BoardId,
          rowVer: board.header.RowVer,
          name: text(data, "name"),
          description: text(data, "description"),
        });
        break;
      case "link":
        result = await actions.setBoardProjectAction({
          boardId: board.header.BoardId,
          rowVer: board.header.RowVer,
          projectId: optionalNumber(data, "project"),
          removeForeignCards: data.get("removeForeign") === "on",
        });
        break;
      case "delete-board":
        result = await actions.deleteBoardAction({
          boardId: board.header.BoardId,
          rowVer: board.header.RowVer,
        });
        if (result.ok) router.push("/boards");
        break;
      case "column": {
        const values = {
          name: text(data, "name"),
          category: text(data, "category") as "todo" | "doing" | "done",
          wipLimit: optionalNumber(data, "limit"),
        };
        result = column
          ? await actions.updateBoardColumnAction({
              ...values,
              boardColumnId: column.BoardColumnId,
              rowVer: column.RowVer,
            })
          : await actions.createBoardColumnAction({ ...values, boardId: board.header.BoardId });
        break;
      }
      case "delete-column":
        result = await actions.deleteBoardColumnAction({
          boardColumnId: column!.BoardColumnId,
          rowVer: column!.RowVer,
          targetColumnId: optionalNumber(data, "target"),
        });
        break;
      case "phase": {
        const values = {
          name: text(data, "name"),
          startDate: text(data, "start") || null,
          endDate: text(data, "end") || null,
        };
        result = phase
          ? await actions.updateBoardPhaseAction({
              ...values,
              boardPhaseId: phase.BoardPhaseId,
              rowVer: phase.RowVer,
            })
          : await actions.createBoardPhaseAction({ ...values, boardId: board.header.BoardId });
        break;
      }
      case "delete-phase":
        result = await actions.deleteBoardPhaseAction({
          boardPhaseId: phase!.BoardPhaseId,
          rowVer: phase!.RowVer,
        });
        break;
      case "sprint": {
        const values = {
          name: text(data, "name"),
          startDate: text(data, "start"),
          endDate: text(data, "end"),
          goal: text(data, "goal"),
          boardPhaseId: optionalNumber(data, "phase"),
        };
        result = sprint
          ? await actions.updateBoardSprintAction({
              ...values,
              boardSprintId: sprint.BoardSprintId,
              rowVer: sprint.RowVer,
            })
          : await actions.createBoardSprintAction({ ...values, boardId: board.header.BoardId });
        break;
      }
      case "delete-sprint":
        result = await actions.deleteBoardSprintAction({
          boardSprintId: sprint!.BoardSprintId,
          rowVer: sprint!.RowVer,
        });
        break;
      case "complete":
        result = await actions.completeBoardSprintAction({
          boardSprintId: sprint!.BoardSprintId,
          rowVer: sprint!.RowVer,
          unfinishedToSprintId: optionalNumber(data, "target"),
        });
        break;
    }
    if (result.ok) router.refresh();
    return result;
  }
  return (
    <>
      <details className="w-full rounded-lg border border-line bg-surface p-3">
        <summary className="cursor-pointer py-2 font-semibold">{U.settings}</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {edit ? (
            <Button variant="secondary" onClick={() => setMode({ kind: "board" })}>
              {U.edit}
            </Button>
          ) : null}
          {remove ? (
            <>
              <Button variant="secondary" onClick={() => setMode({ kind: "link" })}>
                {U.link}
              </Button>
              <Button variant="secondary" onClick={() => setMode({ kind: "delete-board" })}>
                {U.deleteBoard}
              </Button>
            </>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <section>
            <h2 className="mb-2 font-semibold">{M.columns}</h2>
            {board.columns.map((c, i) => (
              <div
                key={c.BoardColumnId}
                className="mb-2 flex flex-wrap items-center gap-2 rounded border border-line p-2"
              >
                <span className="flex-1">
                  {c.Name} · {c.WipCount}
                  {c.WipLimit ? `/${c.WipLimit}` : ""}
                </span>
                {edit ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setMode({ kind: "column", id: c.BoardColumnId })}
                    >
                      {U.edit}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || i === 0}
                      onClick={() =>
                        run(() =>
                          actions.moveBoardColumnAction({
                            boardColumnId: c.BoardColumnId,
                            rowVer: c.RowVer,
                            direction: "up",
                          }),
                        )
                      }
                    >
                      {U.up}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || i === board.columns.length - 1}
                      onClick={() =>
                        run(() =>
                          actions.moveBoardColumnAction({
                            boardColumnId: c.BoardColumnId,
                            rowVer: c.RowVer,
                            direction: "down",
                          }),
                        )
                      }
                    >
                      {U.down}
                    </Button>
                  </>
                ) : null}
                {remove ? (
                  <Button
                    variant="secondary"
                    disabled={board.columns.length === 1}
                    onClick={() => setMode({ kind: "delete-column", id: c.BoardColumnId })}
                  >
                    {U.delete}
                  </Button>
                ) : null}
              </div>
            ))}
            {create && board.columns.length < 12 ? (
              <Button onClick={() => setMode({ kind: "column" })}>{U.newColumn}</Button>
            ) : null}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">{M.phases}</h2>
            {board.phases.map((p, i) => (
              <div
                key={p.BoardPhaseId}
                className="mb-2 flex flex-wrap gap-2 rounded border border-line p-2"
              >
                <span className="w-full font-medium">{p.Name}</span>
                <span>
                  {isoDate(p.StartDate)} — {isoDate(p.EndDate)}
                </span>
                {edit ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setMode({ kind: "phase", id: p.BoardPhaseId })}
                    >
                      {U.edit}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || i === 0}
                      onClick={() =>
                        run(() =>
                          actions.moveBoardPhaseAction({
                            boardPhaseId: p.BoardPhaseId,
                            rowVer: p.RowVer,
                            direction: "up",
                          }),
                        )
                      }
                    >
                      {U.up}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || i === board.phases.length - 1}
                      onClick={() =>
                        run(() =>
                          actions.moveBoardPhaseAction({
                            boardPhaseId: p.BoardPhaseId,
                            rowVer: p.RowVer,
                            direction: "down",
                          }),
                        )
                      }
                    >
                      {U.down}
                    </Button>
                  </>
                ) : null}
                {remove ? (
                  <Button
                    variant="secondary"
                    onClick={() => setMode({ kind: "delete-phase", id: p.BoardPhaseId })}
                  >
                    {U.delete}
                  </Button>
                ) : null}
              </div>
            ))}
            {create ? (
              <Button onClick={() => setMode({ kind: "phase" })}>{M.newPhase}</Button>
            ) : null}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">{M.sprints}</h2>
            {board.sprints.map((s) => (
              <div
                key={s.BoardSprintId}
                className="mb-2 flex flex-wrap gap-2 rounded border border-line p-2"
              >
                <span className="w-full font-medium">
                  {s.Name} · {M.sprintStates[s.State]}
                </span>
                <p className="w-full text-sm">
                  {isoDate(s.StartDate)} — {isoDate(s.EndDate)} · {s.CardCount} {U.count} ·{" "}
                  {s.PointTotal} {U.points}
                </p>
                {s.Goal ? <p className="w-full text-sm">{s.Goal}</p> : null}
                {edit && s.State !== "completed" ? (
                  <Button
                    variant="secondary"
                    onClick={() => setMode({ kind: "sprint", id: s.BoardSprintId })}
                  >
                    {U.edit}
                  </Button>
                ) : null}
                {edit && s.State === "planned" ? (
                  <Button
                    disabled={pending || board.header.ActiveSprintId !== null}
                    onClick={() =>
                      run(() =>
                        actions.startBoardSprintAction({
                          boardSprintId: s.BoardSprintId,
                          rowVer: s.RowVer,
                        }),
                      )
                    }
                  >
                    {M.startSprint}
                  </Button>
                ) : null}
                {edit && s.State === "active" ? (
                  <Button onClick={() => setMode({ kind: "complete", id: s.BoardSprintId })}>
                    {M.completeSprint}
                  </Button>
                ) : null}
                {remove && s.State === "planned" ? (
                  <Button
                    variant="secondary"
                    onClick={() => setMode({ kind: "delete-sprint", id: s.BoardSprintId })}
                  >
                    {U.delete}
                  </Button>
                ) : null}
              </div>
            ))}
            {create ? (
              <Button onClick={() => setMode({ kind: "sprint" })}>{M.newSprint}</Button>
            ) : null}
          </section>
        </div>
      </details>
      {mode ? (
        <BoardForm title={title} close={() => setMode(null)} save={save}>
          {["board", "column", "phase", "sprint"].includes(mode.kind) ? (
            <BoardField
              label={
                mode.kind === "board"
                  ? M.name
                  : mode.kind === "phase"
                    ? M.phaseName
                    : mode.kind === "sprint"
                      ? M.sprintName
                      : M.columns
              }
            >
              <input
                className={control}
                name="name"
                required
                maxLength={mode.kind === "column" ? 60 : mode.kind === "board" ? 200 : 100}
                defaultValue={
                  mode.kind === "board"
                    ? board.header.Name
                    : mode.kind === "column"
                      ? column?.Name
                      : mode.kind === "phase"
                        ? phase?.Name
                        : sprint?.Name
                }
                autoFocus
              />
            </BoardField>
          ) : null}
          {mode.kind === "board" ? (
            <BoardField label={M.description}>
              <textarea
                className={control}
                name="description"
                maxLength={2000}
                defaultValue={board.header.Description ?? ""}
              />
            </BoardField>
          ) : null}
          {mode.kind === "link" ? (
            <>
              <p>{U.linkBody}</p>
              <BoardField label={M.project}>
                <select
                  className={control}
                  name="project"
                  defaultValue={board.header.ProjectId ?? ""}
                >
                  <option value="">{M.noProject}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </BoardField>
              <label className="flex gap-2">
                <input type="checkbox" name="removeForeign" />
                {U.removeForeign}
              </label>
            </>
          ) : null}
          {mode.kind === "column" ? (
            <>
              <BoardField label={U.category}>
                <select
                  className={control}
                  name="category"
                  defaultValue={column?.Category ?? "todo"}
                >
                  {(["todo", "doing", "done"] as const).map((c) => (
                    <option key={c} value={c}>
                      {M.defaultColumns[c]}
                    </option>
                  ))}
                </select>
              </BoardField>
              <BoardField label={U.limit}>
                <input
                  className={control}
                  type="number"
                  min={1}
                  max={999}
                  name="limit"
                  defaultValue={column?.WipLimit ?? ""}
                />
              </BoardField>
            </>
          ) : null}
          {mode.kind === "phase" || mode.kind === "sprint" ? (
            <>
              <BoardField label={U.start}>
                <input
                  className={control}
                  type="date"
                  name="start"
                  required={mode.kind === "sprint"}
                  defaultValue={isoDate(
                    mode.kind === "phase"
                      ? (phase?.StartDate ?? null)
                      : (sprint?.StartDate ?? null),
                  )}
                />
              </BoardField>
              <BoardField label={U.end}>
                <input
                  className={control}
                  type="date"
                  name="end"
                  required={mode.kind === "sprint"}
                  defaultValue={isoDate(
                    mode.kind === "phase" ? (phase?.EndDate ?? null) : (sprint?.EndDate ?? null),
                  )}
                />
              </BoardField>
            </>
          ) : null}
          {mode.kind === "sprint" ? (
            <>
              <BoardField label={M.sprintGoal}>
                <textarea
                  className={control}
                  name="goal"
                  maxLength={1000}
                  defaultValue={sprint?.Goal ?? ""}
                />
              </BoardField>
              <BoardField label={M.sprintPhase}>
                <select className={control} name="phase" defaultValue={sprint?.BoardPhaseId ?? ""}>
                  <option value="">{M.noPhase}</option>
                  {board.phases.map((p) => (
                    <option key={p.BoardPhaseId} value={p.BoardPhaseId}>
                      {p.Name}
                    </option>
                  ))}
                </select>
              </BoardField>
            </>
          ) : null}
          {mode.kind === "delete-board" ? <p>{M.deleteBody}</p> : null}
          {mode.kind === "delete-phase" ? (
            <p>
              {M.deletePhaseBody(
                board.sprints.filter((s) => s.BoardPhaseId === phase?.BoardPhaseId).length,
              )}
            </p>
          ) : null}
          {mode.kind === "delete-sprint" ? (
            <p>{M.deleteSprintBody(sprint?.CardCount ?? 0)}</p>
          ) : null}
          {mode.kind === "delete-column" ? (
            <>
              <p>{M.deleteColumnBody(column?.CardCount ?? 0, U.column)}</p>
              <BoardField label={U.column}>
                <select className={control} name="target" required>
                  {board.columns
                    .filter((c) => c.BoardColumnId !== column?.BoardColumnId)
                    .map((c) => (
                      <option key={c.BoardColumnId} value={c.BoardColumnId}>
                        {c.Name}
                      </option>
                    ))}
                </select>
              </BoardField>
            </>
          ) : null}
          {mode.kind === "complete" ? (
            <>
              <p>
                {M.completeSprintBody(
                  board.cards.filter(
                    (c) =>
                      c.BoardSprintId === sprint?.BoardSprintId &&
                      board.columns.find((col) => col.BoardColumnId === c.BoardColumnId)
                        ?.Category !== "done",
                  ).length,
                  U.target,
                )}
              </p>
              <BoardField label={U.target}>
                <select className={control} name="target">
                  <option value="">{M.backlog}</option>
                  {board.sprints
                    .filter((s) => s.State === "planned")
                    .map((s) => (
                      <option key={s.BoardSprintId} value={s.BoardSprintId}>
                        {s.Name}
                      </option>
                    ))}
                </select>
              </BoardField>
            </>
          ) : null}
        </BoardForm>
      ) : null}
    </>
  );
}
