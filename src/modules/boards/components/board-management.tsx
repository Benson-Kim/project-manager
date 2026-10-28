"use client";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView } from "../schemas/board-view";
import * as actions from "../actions";
import { BoardDetailsDialog } from "./board-details-dialog";
import { ColumnDialog } from "./column-dialog";
import { PhaseDialog } from "./phase-dialog";
import { SprintDialog } from "./sprint-dialog";
import { MAX_BOARD_COLUMNS } from "../schemas/board-rules";
import { formatDate as isoDate } from "@/lib/format";
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
  const { toast } = useToast();
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
      if (result.ok) toast({ variant: "success", title: messages.feedback.saved });
      else setError(result.error.message);
    });
  }
  return (
    <>
      <details className="w-full rounded-lg border border-line bg-surface p-3">
        <summary className="cursor-pointer py-2 font-semibold">{U.settings}</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {edit ? (
            <Button variant="secondary" onClick={() => setMode({ kind: "board" })}>
              {messages.actions.edit}
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
                      {messages.actions.edit}
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
                    {messages.actions.delete}
                  </Button>
                ) : null}
              </div>
            ))}
            {create && board.columns.length < MAX_BOARD_COLUMNS ? (
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
                      {messages.actions.edit}
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
                    {messages.actions.delete}
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
                    {messages.actions.edit}
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
                    {messages.actions.delete}
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
      {mode?.kind === "board" || mode?.kind === "link" || mode?.kind === "delete-board" ? (
        <BoardDetailsDialog
          board={board}
          projects={projects}
          mode={mode.kind}
          close={() => setMode(null)}
        />
      ) : null}
      {mode?.kind === "column" || mode?.kind === "delete-column" ? (
        <ColumnDialog
          key={mode.id ?? "new-column"}
          board={board}
          id={mode.id}
          deleting={mode.kind === "delete-column"}
          close={() => setMode(null)}
        />
      ) : null}
      {mode?.kind === "phase" || mode?.kind === "delete-phase" ? (
        <PhaseDialog
          key={mode.id ?? "new-phase"}
          board={board}
          id={mode.id}
          deleting={mode.kind === "delete-phase"}
          close={() => setMode(null)}
        />
      ) : null}
      {mode?.kind === "sprint" || mode?.kind === "delete-sprint" || mode?.kind === "complete" ? (
        <SprintDialog
          key={`${mode.kind}-${mode.id ?? "new"}`}
          board={board}
          id={mode.id}
          mode={mode.kind}
          close={() => setMode(null)}
        />
      ) : null}
    </>
  );
}
