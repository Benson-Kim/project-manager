"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { usePointerDrag } from "@/components/ui/drag/use-pointer-drag";
import { Menu, MenuButton } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { TONES } from "@/components/ui/tones";
import type { ActionResult } from "@/lib/action";
import { rowAllows } from "@/lib/auth/actor-access";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import { deleteBoardCardAction, moveBoardCardAction, readBoardCardAction } from "../actions";
import {
  deleteBoardCardInput,
  type BoardCardDetailRow,
  type BoardCardListRow,
} from "../schemas/board-card";
import { cardLabel } from "../schemas/board-rules";
import type { BoardAssigneeRow, BoardView } from "../schemas/board-view";
import { BoardConfirm } from "./board-confirm";
import { BoardManagement } from "./board-management";
import { CardDialog, CardMoveDialog } from "./card-dialog";
import { PackageRequirementsButton } from "./package-requirements";

const M = messages.boards;
const U = M.ui;
export function BoardWorkspace({
  board,
  assignees,
  projects,
  planning = false,
  basePath = `/boards/${board.header.BoardId}`,
}: {
  board: BoardView;
  assignees: BoardAssigneeRow[];
  projects: ProjectOption[];
  planning?: boolean;
  basePath?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BoardCardDetailRow | null>(null);
  const [newColumn, setNewColumn] = useState<number | null>(null);
  const [moving, setMoving] = useState<BoardCardListRow | null>(null);
  const [deleting, setDeleting] = useState<BoardCardListRow | null>(null);
  const canCreate = rowAllows("boards:create")(board.header),
    canEdit = rowAllows("boards:update")(board.header),
    canDelete = rowAllows("boards:delete")(board.header);
  const busy = Boolean(editing || newColumn || deleting || moving);
  useEffect(() => {
    if (busy || pending) return;
    const timer = setInterval(() => {
      if (!document.querySelector('[role="dialog"]')) router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [busy, pending, router]);
  function run(operation: () => Promise<ActionResult<unknown>>, notify = true) {
    setError("");
    start(async () => {
      try {
        const result = await operation();
        if (!result.ok) setError(result.error.message);
        else if (notify) toast({ variant: "success", title: messages.feedback.saved });
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
  function reorder(card: BoardCardListRow, offset: number) {
    const peers = board.cards.filter(
      (c) => c.BoardColumnId === card.BoardColumnId && c.BoardSprintId === card.BoardSprintId,
    );
    const index = peers.findIndex((c) => c.BoardCardId === card.BoardCardId);
    if (index + offset < 0 || index + offset >= peers.length) return;
    move(
      card,
      card.BoardColumnId,
      card.BoardSprintId,
      offset < 0 ? peers[index - 1]?.BoardCardId : peers[index + 2]?.BoardCardId,
    );
  }
  function open(card: BoardCardListRow) {
    run(async () => {
      const result = await readBoardCardAction({ boardCardId: card.BoardCardId });
      if (result.ok) setEditing(result.data);
      return result;
    }, false);
  }
  const drag = usePointerDrag({
    enabled: canEdit && !pending && !busy,
    onDrop: ({ itemId, lane, beforeId }) => {
      const card = board.cards.find((c) => c.BoardCardId === itemId);
      if (!card) return;
      const target = lane === "backlog" ? null : Number(lane);
      const before = board.cards.find((c) => c.BoardCardId === beforeId);
      move(
        card,
        planning ? card.BoardColumnId : Number(target),
        planning ? target : undefined,
        before && (!planning || before.BoardColumnId === card.BoardColumnId) ? beforeId : undefined,
      );
    },
  });
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
          <h1 className="text-2xl font-semibold">{board.header.Name}</h1>
          <p className="text-sm text-ink-muted">{board.header.ProjectName ?? M.noProject}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <nav aria-label={U.views} className="flex gap-1 rounded-md border border-line p-1">
            <Link
              className={buttonClass(planning ? "ghost" : "secondary")}
              aria-current={!planning ? "page" : undefined}
              href={basePath}
            >
              {U.board}
            </Link>
            <Link
              className={buttonClass(planning ? "secondary" : "ghost")}
              aria-current={planning ? "page" : undefined}
              href={`${basePath}?view=plan`}
            >
              {U.plan}
            </Link>
          </nav>
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
      <div data-drag-container className="flex gap-4 overflow-x-auto pb-6" aria-busy={pending}>
        {lanes.map((lane) => {
          const cards = board.cards.filter((c) =>
            planning ? c.BoardSprintId === lane.id : c.BoardColumnId === lane.id,
          );
          return (
            <section
              key={lane.id ?? "backlog"}
              aria-label={lane.name}
              className="flex min-w-[280px] max-w-[360px] flex-1 flex-col rounded-lg border border-line bg-surface-sunken"
              data-drag-lane={lane.id ?? "backlog"}
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
                    data-drag-item={card.BoardCardId}
                    className={`rounded-md border border-line p-3 shadow-sm ${card.Color ? TONES[card.Color].fill : "bg-surface"} ${drag.dragging === card.BoardCardId ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label={U.dragCard(cardLabel(card))}
                          className="min-h-10 min-w-9 touch-none cursor-grab text-ink-muted"
                          {...drag.bind(card.BoardCardId)}
                        >
                          ⠿
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="min-h-11 min-w-0 flex-1 line-clamp-3 text-left font-semibold"
                        disabled={pending}
                        onClick={() => open(card)}
                      >
                        {cardLabel(card)}
                      </button>
                      {canEdit || canDelete ? (
                        <Menu
                          label={U.cardActions}
                          trigger="⋮"
                          triggerClassName="min-h-10 min-w-9 text-ink-muted"
                        >
                          <MenuButton onClick={() => open(card)}>{U.editCard}</MenuButton>
                          {canEdit ? (
                            <>
                              <MenuButton onClick={() => setMoving(card)}>{U.move}</MenuButton>
                              <MenuButton onClick={() => reorder(card, -1)}>{U.up}</MenuButton>
                              <MenuButton onClick={() => reorder(card, 1)}>{U.down}</MenuButton>
                            </>
                          ) : null}
                          {canDelete ? (
                            <MenuButton onClick={() => setDeleting(card)}>
                              {messages.actions.delete}
                            </MenuButton>
                          ) : null}
                        </Menu>
                      ) : null}
                    </div>
                    {card.RequirementState !== "none" ? (
                      <p className="text-xs text-ink-muted">
                        {card.RequirementState === "live"
                          ? (card.RequirementRef ??
                            `${card.RequirementType}-${card.RequirementNumber}`)
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
                      {card.DueDate ? <time>{formatDate(card.DueDate)}</time> : null}
                      {card.StoryPoints !== null ? (
                        <span>
                          {card.StoryPoints} {U.points}
                        </span>
                      ) : null}
                    </div>
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
            </section>
          );
        })}
      </div>
      {editing || newColumn ? (
        <CardDialog
          board={board}
          card={editing}
          columnId={newColumn}
          assignees={assignees}
          canEdit={canEdit}
          close={() => {
            setEditing(null);
            setNewColumn(null);
          }}
        />
      ) : null}
      {moving ? <CardMoveDialog board={board} card={moving} close={() => setMoving(null)} /> : null}
      {deleting ? (
        <BoardConfirm
          title={U.deleteCard}
          body={U.deleteCardBody}
          schema={deleteBoardCardInput}
          input={{ boardCardId: deleting.BoardCardId, rowVer: deleting.RowVer }}
          save={deleteBoardCardAction}
          close={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
