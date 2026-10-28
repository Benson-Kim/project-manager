"use client";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { IconButton } from "@/components/ui/data-view/datasheet-cells";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Menu, MenuButton } from "@/components/ui/menu";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import * as actions from "../actions";
import { MAX_BOARD_COLUMNS } from "../schemas/board-rules";
import type { BoardView } from "../schemas/board-view";
import { BoardDetailsDialog } from "./board-details-dialog";
import { ColumnDialog } from "./column-dialog";
import { PhaseDialog } from "./phase-dialog";
import { SprintDialog } from "./sprint-dialog";

const M = messages.boards;
const U = M.ui;
const ROW_MENU = "min-h-10 min-w-9 rounded-md text-ink-muted hover:bg-surface-sunken";

type Direction = "up" | "down";
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

const dates = (start: Date | null, end: Date | null) =>
  start || end ? `${formatDate(start)} – ${formatDate(end)}` : "";

function Row({
  name,
  detail,
  move,
  children,
}: {
  name: string;
  detail: string;
  move?: { first: boolean; last: boolean; disabled: boolean; onMove: (to: Direction) => void };
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-12 items-center gap-1 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        {detail ? <p className="text-sm text-ink-muted">{detail}</p> : null}
      </div>
      {move ? (
        <>
          <IconButton
            label={messages.lookupLists.moveUp(name)}
            disabled={move.first || move.disabled}
            onClick={() => move.onMove("up")}
          >
            <path d="M4 10l4-4 4 4" />
          </IconButton>
          <IconButton
            label={messages.lookupLists.moveDown(name)}
            disabled={move.last || move.disabled}
            onClick={() => move.onMove("down")}
          >
            <path d="M4 6l4 4 4-4" />
          </IconButton>
        </>
      ) : null}
      {children ? (
        <Menu label={U.actionsFor(name)} trigger="⋮" triggerClassName={ROW_MENU}>
          {children}
        </Menu>
      ) : null}
    </li>
  );
}

export function BoardManagement({
  board,
  projects,
}: {
  board: BoardView;
  projects: ProjectOption[];
}) {
  const { toast } = useToast();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const edit = rowAllows("boards:update")(board.header);
  const create = rowAllows("boards:create")(board.header);
  const remove = rowAllows("boards:delete")(board.header);
  const close = () => setMode(null);

  function run(work: () => Promise<ActionResult<unknown>>) {
    setError(null);
    start(async () => {
      const result = await work();
      if (result.ok) toast({ variant: "success", title: messages.feedback.saved });
      else setError(result.error.message);
    });
  }

  const moveColumn = (c: BoardView["columns"][number], direction: Direction) =>
    run(() =>
      actions.moveBoardColumnAction({
        boardColumnId: c.BoardColumnId,
        rowVer: c.RowVer,
        direction,
      }),
    );
  const movePhase = (p: BoardView["phases"][number], direction: Direction) =>
    run(() =>
      actions.moveBoardPhaseAction({ boardPhaseId: p.BoardPhaseId, rowVer: p.RowVer, direction }),
    );

  return (
    <>
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {U.settings}
      </Button>
      {create ? (
        <Menu
          label={U.create}
          align="start"
          trigger={
            <>
              {U.create}
              <Chevron />
            </>
          }
          triggerClassName={buttonClass("secondary")}
        >
          {board.columns.length < MAX_BOARD_COLUMNS ? (
            <MenuButton onClick={() => setMode({ kind: "column" })}>{U.column}</MenuButton>
          ) : null}
          <MenuButton onClick={() => setMode({ kind: "phase" })}>{U.phase}</MenuButton>
          <MenuButton onClick={() => setMode({ kind: "sprint" })}>{U.sprint}</MenuButton>
        </Menu>
      ) : null}
      {edit || remove ? (
        <Menu
          label={U.boardActions}
          trigger="⋮"
          triggerClassName={`${ROW_MENU} border border-line`}
        >
          {edit ? (
            <MenuButton onClick={() => setMode({ kind: "board" })}>{U.editBoard}</MenuButton>
          ) : null}
          {remove ? (
            <>
              <MenuButton onClick={() => setMode({ kind: "link" })}>{U.link}</MenuButton>
              <MenuButton onClick={() => setMode({ kind: "delete-board" })}>
                {U.deleteBoard}
              </MenuButton>
            </>
          ) : null}
        </Menu>
      ) : null}
      <div id={panelId} hidden={!open} className="w-full" aria-busy={pending}>
        <ErrorSummary message={error} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel id={`${panelId}-columns`} title={M.columns}>
            <ul className="divide-y divide-line">
              {board.columns.map((c, i) => (
                <Row
                  key={c.BoardColumnId}
                  name={c.Name}
                  detail={`${M.defaultColumns[c.Category]} · ${c.WipCount}${c.WipLimit ? ` / ${c.WipLimit}` : ""} ${U.count}`}
                  move={
                    edit
                      ? {
                          first: i === 0,
                          last: i === board.columns.length - 1,
                          disabled: pending,
                          onMove: (to) => moveColumn(c, to),
                        }
                      : undefined
                  }
                >
                  {edit ? (
                    <MenuButton onClick={() => setMode({ kind: "column", id: c.BoardColumnId })}>
                      {messages.actions.edit}
                    </MenuButton>
                  ) : null}
                  {remove && board.columns.length > 1 ? (
                    <MenuButton
                      onClick={() => setMode({ kind: "delete-column", id: c.BoardColumnId })}
                    >
                      {messages.actions.delete}
                    </MenuButton>
                  ) : null}
                </Row>
              ))}
            </ul>
          </Panel>
          <Panel id={`${panelId}-phases`} title={M.phases}>
            {board.phases.length ? (
              <ul className="divide-y divide-line">
                {board.phases.map((p, i) => (
                  <Row
                    key={p.BoardPhaseId}
                    name={p.Name}
                    detail={dates(p.StartDate, p.EndDate)}
                    move={
                      edit
                        ? {
                            first: i === 0,
                            last: i === board.phases.length - 1,
                            disabled: pending,
                            onMove: (to) => movePhase(p, to),
                          }
                        : undefined
                    }
                  >
                    {edit ? (
                      <MenuButton onClick={() => setMode({ kind: "phase", id: p.BoardPhaseId })}>
                        {messages.actions.edit}
                      </MenuButton>
                    ) : null}
                    {remove ? (
                      <MenuButton
                        onClick={() => setMode({ kind: "delete-phase", id: p.BoardPhaseId })}
                      >
                        {messages.actions.delete}
                      </MenuButton>
                    ) : null}
                  </Row>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{U.noPhases}</p>
            )}
          </Panel>
          <Panel id={`${panelId}-sprints`} title={M.sprints}>
            {board.sprints.length ? (
              <ul className="divide-y divide-line">
                {board.sprints.map((s) => (
                  <Row
                    key={s.BoardSprintId}
                    name={s.Name}
                    detail={[
                      M.sprintStates[s.State],
                      dates(s.StartDate, s.EndDate),
                      `${s.CardCount} ${U.count}`,
                      `${s.PointTotal} ${U.points}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {edit && s.State !== "completed" ? (
                      <MenuButton onClick={() => setMode({ kind: "sprint", id: s.BoardSprintId })}>
                        {messages.actions.edit}
                      </MenuButton>
                    ) : null}
                    {edit && s.State === "planned" && board.header.ActiveSprintId === null ? (
                      <MenuButton
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
                      </MenuButton>
                    ) : null}
                    {edit && s.State === "active" ? (
                      <MenuButton
                        onClick={() => setMode({ kind: "complete", id: s.BoardSprintId })}
                      >
                        {M.completeSprint}
                      </MenuButton>
                    ) : null}
                    {remove && s.State === "planned" ? (
                      <MenuButton
                        onClick={() => setMode({ kind: "delete-sprint", id: s.BoardSprintId })}
                      >
                        {messages.actions.delete}
                      </MenuButton>
                    ) : null}
                  </Row>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{U.noSprints}</p>
            )}
          </Panel>
        </div>
      </div>
      {mode?.kind === "board" || mode?.kind === "link" || mode?.kind === "delete-board" ? (
        <BoardDetailsDialog board={board} projects={projects} mode={mode.kind} close={close} />
      ) : null}
      {mode?.kind === "column" || mode?.kind === "delete-column" ? (
        <ColumnDialog
          key={mode.id ?? "new-column"}
          board={board}
          id={mode.id}
          deleting={mode.kind === "delete-column"}
          close={close}
        />
      ) : null}
      {mode?.kind === "phase" || mode?.kind === "delete-phase" ? (
        <PhaseDialog
          key={mode.id ?? "new-phase"}
          board={board}
          id={mode.id}
          deleting={mode.kind === "delete-phase"}
          close={close}
        />
      ) : null}
      {mode?.kind === "sprint" || mode?.kind === "delete-sprint" || mode?.kind === "complete" ? (
        <SprintDialog
          key={`${mode.kind}-${mode.id ?? "new"}`}
          board={board}
          id={mode.id}
          mode={mode.kind}
          close={close}
        />
      ) : null}
    </>
  );
}
