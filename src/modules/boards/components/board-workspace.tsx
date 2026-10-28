"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { messages } from "@/lib/messages";
import { rowAllows } from "@/lib/auth/actor-access";
import { OPTION_COLORS, type OptionColor } from "@/lib/lookup-lists";
import { TONES } from "@/components/ui/tones";
import type { ActionResult } from "@/lib/action";
import type { ProjectOption } from "@/modules/projects/project-options";
import type { BoardView, BoardAssigneeRow } from "../schemas/board-view";
import type { BoardCardListRow, BoardCardDetailRow } from "../schemas/board-card";
import { PackageRequirementsButton } from "./package-requirements";
import { BoardManagement } from "./board-management";
import { cardLabel } from "../schemas/board-rules";
import {
  createBoardCardAction,
  updateBoardCardAction,
  moveBoardCardAction,
  deleteBoardCardAction,
  readBoardCardAction,
} from "../actions";
import { BoardField, BoardForm, control, text, optionalNumber, isoDate } from "./board-form";
const M = messages.boards;
const U = M.ui;
export function BoardWorkspace({
  board,
  assignees,
  projects,
  planning = false,
}: {
  board: BoardView;
  assignees: BoardAssigneeRow[];
  projects: ProjectOption[];
  planning?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BoardCardDetailRow | null>(null);
  const [newColumn, setNewColumn] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<BoardCardListRow | null>(null);
  const canCreate = rowAllows("boards:create")(board.header),
    canEdit = rowAllows("boards:update")(board.header),
    canDelete = rowAllows("boards:delete")(board.header);
  const busy = Boolean(editing || newColumn || deleting);
  useEffect(() => {
    if (busy || pending) return;
    const timer = setInterval(() => {
      if (!document.querySelector('[role="dialog"]')) router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [busy, pending, router]);
  function run(operation: () => Promise<ActionResult<unknown>>) {
    setError("");
    start(async () => {
      try {
        const result = await operation();
        if (!result.ok) setError(result.error.message);
        else router.refresh();
      } catch {
        setError(messages.errors.INTERNAL);
      }
    });
  }
  function move(card: BoardCardListRow, column: number, sprint?: number | null, before?: number) {
    run(() =>
      moveBoardCardAction({
        boardCardId: card.BoardCardId,
        rowVer: card.RowVer,
        toColumnId: column,
        toSprintId: sprint,
        sprintSet: planning,
        beforeCardId: before,
      }),
    );
  }
  function open(card: BoardCardListRow) {
    run(async () => {
      const result = await readBoardCardAction({ boardCardId: card.BoardCardId });
      if (result.ok) setEditing(result.data);
      return result;
    });
  }
  const lanes = planning
    ? [
        { id: null, name: M.backlog, limit: null, count: board.header.BacklogCount },
        ...board.sprints.map((s) => ({
          id: s.BoardSprintId,
          name: `${s.Name} · ${M.sprintStates[s.State]}`,
          limit: null,
          count: s.CardCount,
        })),
      ]
    : board.columns.map((c) => ({
        id: c.BoardColumnId,
        name: c.Name,
        limit: c.WipLimit,
        count: c.WipCount,
      }));
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/boards" className="text-sm text-accent underline">
            {M.title}
          </Link>
          <h1 className="text-2xl font-semibold">{board.header.Name}</h1>
          <p className="text-sm text-ink-muted">{board.header.ProjectName ?? M.noProject}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={control} href={`/boards/${board.header.BoardId}`}>
            {U.board}
          </Link>
          <Link className={control} href={`/boards/${board.header.BoardId}?view=plan`}>
            {U.plan}
          </Link>
          <Button variant="secondary" onClick={() => router.refresh()} disabled={pending}>
            {U.refresh}
          </Button>
        </div>
      </header>
      {board.header.Description ? <p>{board.header.Description}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput />
        {canCreate ? (
          <Button
            disabled={pending}
            onClick={() => setNewColumn(board.columns[0]?.BoardColumnId ?? null)}
          >
            {U.newCard}
          </Button>
        ) : null}
        {canCreate ? <PackageRequirementsButton board={board} projects={projects} /> : null}
        <BoardManagement board={board} projects={projects} />
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-danger p-3 text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-4 overflow-x-auto pb-6" aria-busy={pending}>
        {lanes.map((lane) => {
          const cards = board.cards.filter((c) =>
            planning ? c.BoardSprintId === lane.id : c.BoardColumnId === lane.id,
          );
          return (
            <section
              key={lane.id ?? "backlog"}
              aria-label={lane.name}
              className="flex min-w-[280px] max-w-[360px] flex-1 flex-col rounded-lg border border-line bg-surface-sunken"
              onDragOver={(e) => {
                if (canEdit) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("application/x-board-card"));
                const card = board.cards.find((c) => c.BoardCardId === id);
                if (card && canEdit && !pending)
                  move(
                    card,
                    planning ? card.BoardColumnId : lane.id!,
                    planning ? lane.id : undefined,
                  );
              }}
            >
              <header className="flex items-center justify-between border-b border-line p-3">
                <h2 className="font-semibold">{lane.name}</h2>
                <span
                  className={
                    lane.limit !== null && lane.count >= lane.limit
                      ? "text-danger"
                      : "text-ink-muted"
                  }
                >
                  {lane.count}
                  {lane.limit !== null ? ` / ${lane.limit}` : ""}
                </span>
              </header>
              <div className="flex flex-1 flex-col gap-3 p-3">
                {cards.map((card) => (
                  <article
                    key={card.BoardCardId}
                    draggable={canEdit && !pending}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("application/x-board-card", String(card.BoardCardId))
                    }
                    onDragOver={(e) => {
                      if (canEdit) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const moving = board.cards.find(
                        (c) =>
                          c.BoardCardId ===
                          Number(e.dataTransfer.getData("application/x-board-card")),
                      );
                      if (moving && moving.BoardCardId !== card.BoardCardId && canEdit && !pending)
                        move(
                          moving,
                          planning ? moving.BoardColumnId : card.BoardColumnId,
                          card.BoardSprintId,
                          !planning || moving.BoardColumnId === card.BoardColumnId
                            ? card.BoardCardId
                            : undefined,
                        );
                    }}
                    className={`rounded-md border border-line p-3 shadow-sm ${card.Color ? TONES[card.Color].fill : "bg-surface"}`}
                  >
                    <button
                      type="button"
                      className="min-h-11 w-full text-left font-semibold"
                      disabled={pending}
                      onClick={() => open(card)}
                    >
                      {cardLabel(card)}
                    </button>
                    {card.RequirementState !== "none" ? (
                      <p className="text-xs text-ink-muted">
                        {card.RequirementState === "live"
                          ? `${card.RequirementType}-${card.RequirementNumber}`
                          : card.RequirementState === "restricted"
                            ? M.restrictedCard
                            : M.removedCard}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                      {card.AssigneeUserId ? (
                        <span>
                          {assignees.find((a) => a.UserId === card.AssigneeUserId)?.DisplayName ??
                            U.assignee}
                        </span>
                      ) : null}
                      {card.DueDate ? <time>{isoDate(card.DueDate)}</time> : null}
                      {card.StoryPoints !== null ? (
                        <span>
                          {card.StoryPoints} {U.points}
                        </span>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <label className="text-xs">
                          {U.column}
                          <select
                            className={control}
                            disabled={pending}
                            value={card.BoardColumnId}
                            onChange={(e) => move(card, Number(e.target.value))}
                          >
                            {board.columns.map((c) => (
                              <option key={c.BoardColumnId} value={c.BoardColumnId}>
                                {c.Name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs">
                          {U.sprint}
                          <select
                            className={control}
                            disabled={pending}
                            value={card.BoardSprintId ?? ""}
                            onChange={(e) =>
                              run(() =>
                                moveBoardCardAction({
                                  boardCardId: card.BoardCardId,
                                  rowVer: card.RowVer,
                                  toColumnId: card.BoardColumnId,
                                  toSprintId: e.target.value ? Number(e.target.value) : null,
                                  sprintSet: true,
                                }),
                              )
                            }
                          >
                            <option value="">{M.backlog}</option>
                            {board.sprints
                              .filter(
                                (s) =>
                                  s.State !== "completed" || s.BoardSprintId === card.BoardSprintId,
                              )
                              .map((s) => (
                                <option
                                  key={s.BoardSprintId}
                                  value={s.BoardSprintId}
                                  disabled={s.State === "completed"}
                                >
                                  {s.Name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            disabled={pending || cards[0]?.BoardCardId === card.BoardCardId}
                            onClick={() => {
                              const i = cards.indexOf(card);
                              move(
                                card,
                                card.BoardColumnId,
                                card.BoardSprintId,
                                cards[i - 1]?.BoardCardId,
                              );
                            }}
                          >
                            {U.up}
                          </Button>
                          {canDelete ? (
                            <Button
                              variant="secondary"
                              disabled={pending}
                              onClick={() => setDeleting(card)}
                            >
                              {U.delete}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {!planning && canCreate ? (
                <Button
                  variant="secondary"
                  className="m-3"
                  disabled={pending}
                  onClick={() => setNewColumn(lane.id)}
                >
                  {U.newCard}
                </Button>
              ) : null}
              {cards.length >= 200 ? <p className="p-3 text-sm">{U.limited}</p> : null}
            </section>
          );
        })}
      </div>
      {editing || newColumn ? (
        <BoardForm
          key={editing?.BoardCardId ?? "new"}
          title={editing ? U.editCard : U.newCard}
          readOnly={Boolean(editing) && !canEdit}
          close={() => {
            setEditing(null);
            setNewColumn(null);
          }}
          save={async (data) => {
            const values = {
              title: text(data, "title") || null,
              notes: text(data, "notes"),
              assigneeUserId: optionalNumber(data, "assignee"),
              dueDate: text(data, "due") || null,
              storyPoints: optionalNumber(data, "points"),
              color: (text(data, "color") || null) as OptionColor | null,
            };
            const result = editing
              ? await updateBoardCardAction({
                  ...values,
                  boardCardId: editing.BoardCardId,
                  rowVer: editing.RowVer,
                })
              : await createBoardCardAction({
                  ...values,
                  title: values.title ?? "",
                  boardId: board.header.BoardId,
                  boardColumnId: newColumn!,
                  boardSprintId: board.header.ActiveSprintId,
                });
            if (result.ok) router.refresh();
            return result;
          }}
        >
          <fieldset disabled={!canEdit && Boolean(editing)} className="flex flex-col gap-4">
            <BoardField label={U.cardTitle}>
              <input
                name="title"
                className={control}
                defaultValue={editing?.Title ?? ""}
                required={!editing?.RequirementId}
                maxLength={300}
                autoFocus
              />
            </BoardField>
            <RichTextEditor name="notes" label={U.notes} defaultValue={editing?.Notes} />
            <BoardField label={U.assignee}>
              <select
                className={control}
                name="assignee"
                defaultValue={editing?.AssigneeUserId ?? ""}
              >
                <option value="">{U.unassigned}</option>
                {assignees.map((a) => (
                  <option key={a.UserId} value={a.UserId}>
                    {a.DisplayName}
                  </option>
                ))}
              </select>
            </BoardField>
            <BoardField label={U.due}>
              <input
                type="date"
                name="due"
                className={control}
                defaultValue={isoDate(editing?.DueDate ?? null)}
              />
            </BoardField>
            <BoardField label={U.points}>
              <input
                type="number"
                name="points"
                min={0}
                max={999}
                className={control}
                defaultValue={editing?.StoryPoints ?? ""}
              />
            </BoardField>
            <BoardField label={U.color}>
              <select name="color" className={control} defaultValue={editing?.Color ?? ""}>
                <option value="">{U.noColor}</option>
                {OPTION_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </BoardField>
          </fieldset>
        </BoardForm>
      ) : null}
      {deleting ? (
        <BoardForm
          title={U.deleteCard}
          close={() => setDeleting(null)}
          save={async () => {
            const result = await deleteBoardCardAction({
              boardCardId: deleting.BoardCardId,
              rowVer: deleting.RowVer,
            });
            if (result.ok) router.refresh();
            return result;
          }}
        >
          <p>{U.deleteCardBody}</p>
        </BoardForm>
      ) : null}
    </section>
  );
}
