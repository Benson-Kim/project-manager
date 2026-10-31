"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { DROP_MS, usePointerDrag } from "@/components/ui/drag/use-pointer-drag";
import { useLookupLists } from "@/components/ui/lookup-lists";
import { Menu, MenuButton } from "@/components/ui/menu";
import { useFlip } from "@/components/ui/motion/use-flip";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { rowAllows } from "@/lib/auth/actor-access";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import { deleteBoardCardAction, moveBoardCardAction, readBoardCardAction } from "../actions";
import {
  deleteBoardCardInput,
  type BoardCardDetailRow,
  type BoardCardListRow,
} from "../schemas/board-card";
import {
  NO_KANBAN_FILTER,
  dropPlacement,
  kanbanJson,
  kanbanShows,
  kanbanStats,
  laneOrder,
  placeCard,
  columnTones,
  type CardPlacement,
  type KanbanFilter,
  type LaneTone,
} from "../schemas/board-kanban";
import { cardLabel, wipState } from "../schemas/board-rules";
import type { BoardAssigneeRow, BoardView } from "../schemas/board-view";
import { BoardConfirm } from "./board-confirm";
import { BoardManagement } from "./board-management";
import { CardDialog, CardMoveDialog } from "./card-dialog";
import {
  KanbanCardBody,
  KanbanCardTags,
  hasCardTags,
  kanbanCardClass,
  kanbanReveal,
} from "./kanban-card";
import { CopyJsonButton, KanbanFilterBar, KanbanStatsRow } from "./kanban-toolbar";
import { PackageRequirementsButton } from "./package-requirements";

const M = messages.boards;
const U = M.ui;

/** A lane's top border: where its cards sit in the flow. */
const LANE_TOP: Record<LaneTone, string> = {
  gray: "border-t-tone-gray-ink",
  blue: "border-t-tone-blue-ink",
  orange: "border-t-tone-orange-ink",
  purple: "border-t-tone-purple-ink",
  green: "border-t-tone-green-ink",
};
const SPRINT_TONE = { planned: "gray", active: "blue", completed: "green" } as const;
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
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [filter, setFilter] = useState<KanbanFilter>(NO_KANBAN_FILTER);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BoardCardDetailRow | null>(null);
  const sheetChanged = useRef(false);
  const [newColumn, setNewColumn] = useState<number | null>(null);
  const [moving, setMoving] = useState<BoardCardListRow | null>(null);
  const refocus = useRef<number | null>(null);
  const [deleting, setDeleting] = useState<BoardCardListRow | null>(null);
  const canCreate = rowAllows("boards:create")(board.header),
    canEdit = rowAllows("boards:update")(board.header),
    canDelete = rowAllows("boards:delete")(board.header);
  const busy = Boolean(editing || newColumn || deleting || moving);
  const [cards, placeOptimistic] = useOptimistic(
    board.cards,
    (current: BoardCardListRow[], placement: CardPlacement) => placeCard(current, placement),
  );
  const drag = usePointerDrag({
    enabled: canEdit && !pending && !busy,
    onDrop: (drop) => {
      const placement = dropPlacement(cards, drop, planning);
      if (
        placement &&
        laneOrder(placeCard(cards, placement), planning) !== laneOrder(cards, planning)
      )
        move(placement);
    },
  });
  const dragging = drag.dragging !== null;
  useEffect(() => {
    if (busy || pending || dragging) return;
    const timer = setInterval(() => {
      if (!document.querySelector('[role="dialog"]')) router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [busy, pending, dragging, router]);
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
  /** The card shows in its new place at once; the server's answer replaces it, or puts it back. */
  function move(placement: CardPlacement) {
    const card = cards.find((c) => c.BoardCardId === placement.cardId);
    if (!card) return;
    run(() => {
      placeOptimistic(placement);
      return moveBoardCardAction({
        boardCardId: card.BoardCardId,
        rowVer: card.RowVer,
        toColumnId: placement.columnId,
        toSprintId: planning ? placement.sprintId : undefined,
        sprintSet: planning,
        beforeCardId: placement.beforeId,
      });
    });
  }
  function reorder(card: BoardCardListRow, offset: number) {
    const peers = cards.filter(
      (c) => c.BoardColumnId === card.BoardColumnId && c.BoardSprintId === card.BoardSprintId,
    );
    const index = peers.findIndex((c) => c.BoardCardId === card.BoardCardId);
    if (index + offset < 0 || index + offset >= peers.length) return;
    refocus.current = card.BoardCardId;
    move({
      cardId: card.BoardCardId,
      columnId: card.BoardColumnId,
      sprintId: card.BoardSprintId,
      beforeId: offset < 0 ? peers[index - 1]?.BoardCardId : peers[index + 2]?.BoardCardId,
    });
  }
  function open(card: BoardCardListRow) {
    run(async () => {
      const result = await readBoardCardAction({ boardCardId: card.BoardCardId });
      if (result.ok) setEditing(result.data);
      return result;
    }, false);
  }
  const columnTone = columnTones(board.columns.map((c) => c.Category));
  const lanes = planning
    ? [
        {
          id: null,
          name: M.backlog,
          limit: null,
          count: board.header.BacklogCount,
          tone: LANE_TOP.gray,
        },
        ...board.sprints.map((s) => ({
          id: s.BoardSprintId,
          name: `${s.Name} · ${M.sprintStates[s.State]}`,
          limit: null,
          count: s.CardCount,
          tone: LANE_TOP[SPRINT_TONE[s.State]],
        })),
      ]
    : board.columns.map((c, i) => ({
        id: c.BoardColumnId,
        name: c.Name,
        limit: c.WipLimit,
        count: c.WipCount,
        tone: LANE_TOP[columnTone[i]],
      }));
  const assigneeNames = useMemo(
    () => new Map(assignees.map((a) => [a.UserId, a.DisplayName])),
    [assignees],
  );
  const { over } = drag;
  const shownCards = useMemo(() => {
    const placement = over ? dropPlacement(cards, over, planning) : null;
    const placed = placement ? placeCard(cards, placement) : cards;
    return placed.filter((card) => kanbanShows(card, filter));
  }, [cards, over, planning, filter]);
  const laneRef = useRef<HTMLDivElement>(null);
  /** A card moved from its menu leaves the page when it moves, so its menu takes focus again. */
  useEffect(() => {
    const id = refocus.current;
    if (id === null) return;
    if (!document.activeElement || document.activeElement === document.body)
      laneRef.current
        ?.querySelector<HTMLElement>(`[data-drag-item="${id}"] [aria-haspopup="menu"]`)
        ?.focus();
    if (!pending) refocus.current = null;
  }, [cards, pending]);
  useFlip(laneRef, laneOrder(shownCards, planning), {
    attribute: "data-drag-item",
    duration: DROP_MS,
  });
  const topPriority = useLookupLists().lists["key-deliverable.priority"]?.options[0]?.label ?? null;
  const stats = useMemo(() => kanbanStats(board.cards, topPriority), [board.cards, topPriority]);
  const json = () =>
    kanbanJson(shownCards, {
      columns: new Map(board.columns.map((c) => [c.BoardColumnId, c.Name])),
      sprints: new Map(board.sprints.map((s) => [s.BoardSprintId, s.Name])),
      assignees: assigneeNames,
    });
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">{board.header.Name}</h1>
        <p className="text-sm text-ink-muted">{board.header.ProjectName ?? M.noProject}</p>
        <nav
          aria-label={U.views}
          className="ml-auto flex gap-0.5 self-center rounded-md border border-line p-0.5"
        >
          <Link
            className={buttonClass(planning ? "ghost" : "secondary", "compact")}
            aria-current={!planning ? "page" : undefined}
            href={basePath}
          >
            {U.board}
          </Link>
          <Link
            className={buttonClass(planning ? "secondary" : "ghost", "compact")}
            aria-current={planning ? "page" : undefined}
            href={`${basePath}?view=plan`}
          >
            {U.plan}
          </Link>
        </nav>
      </header>
      {board.header.Description ? <p className="text-sm">{board.header.Description}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <KanbanStatsRow stats={stats} top={topPriority} />
        </div>
        {canCreate ? (
          <Button
            size="compact"
            disabled={pending}
            onClick={() => setNewColumn(board.columns[0]?.BoardColumnId ?? null)}
          >
            <span aria-hidden="true">+</span>
            {U.newCard}
          </Button>
        ) : null}
        {canCreate ? <PackageRequirementsButton board={board} projects={projects} /> : null}
        <Button
          variant="secondary"
          size="compact"
          onClick={() => router.refresh()}
          disabled={pending}
        >
          {U.refresh}
        </Button>
        <CopyJsonButton copyJson={json} />
        <BoardManagement board={board} projects={projects} />
      </div>
      <KanbanFilterBar
        filter={filter}
        onChange={setFilter}
        searching={Boolean(searchParams.get("q"))}
        onClearSearch={() => router.replace(planning ? `${basePath}?view=plan` : basePath)}
        shown={shownCards.length}
        search={<SearchInput compact />}
      />
      {error ? (
        <p role="alert" className="rounded-md border border-danger p-3 text-danger">
          {error}
        </p>
      ) : null}
      <div
        ref={laneRef}
        data-drag-container
        className="flex items-start gap-3.5 overflow-x-auto pb-6"
        aria-busy={pending}
      >
        {lanes.map((lane) => {
          const cards = shownCards.filter((c) =>
            planning ? c.BoardSprintId === lane.id : c.BoardColumnId === lane.id,
          );
          const wip = wipState(lane.count, lane.limit);
          return (
            <section
              key={lane.id ?? "backlog"}
              aria-label={lane.name}
              className={`flex w-[290px] flex-none flex-col rounded-2xl border border-t-[3px] border-line bg-surface-sunken ${lane.tone}`}
              data-drag-lane={lane.id ?? "backlog"}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                <h2 className="text-[13px] font-semibold">{lane.name}</h2>
                <span
                  data-testid="kanban-lane-count"
                  className={`rounded-full border px-2 text-[11px] ${wip === "full" || wip === "over" ? "border-danger text-danger" : "border-line text-ink-muted"}`}
                >
                  {lane.count}
                  {lane.limit !== null ? ` / ${lane.limit}` : ""}
                </span>
              </header>
              <div className="flex min-h-30 flex-1 flex-col gap-2.5 p-2.5">
                {cards.map((card) => {
                  const tagged = hasCardTags(card);
                  const menu =
                    canEdit || canDelete ? (
                      <Menu
                        label={U.cardActions}
                        trigger="⋮"
                        triggerClassName={`relative z-10 -my-1 flex size-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink ${kanbanReveal}`}
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
                    ) : null;
                  return (
                    <article
                      key={card.BoardCardId}
                      data-drag-item={card.BoardCardId}
                      className={`${kanbanCardClass(drag.dragging === card.BoardCardId)} ${canEdit ? "select-none" : ""}`}
                      {...drag.bind(card.BoardCardId)}
                    >
                      {tagged ? <KanbanCardTags card={card} menu={menu} /> : null}
                      {canEdit ? (
                        <button
                          type="button"
                          data-drag-handle
                          aria-label={U.dragCard(cardLabel(card))}
                          className={`absolute top-1/2 -left-px z-10 flex h-10 w-4 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded-r-md text-xs text-ink-muted hover:bg-surface-raised ${kanbanReveal}`}
                        >
                          ⠿
                        </button>
                      ) : null}
                      <div className="flex items-start gap-2">
                        <h3 className="m-0 min-w-0 flex-1">
                          <button
                            type="button"
                            className="line-clamp-3 w-full cursor-pointer text-left text-[13px] leading-snug font-semibold text-ink"
                            disabled={pending}
                            onClick={() => open(card)}
                          >
                            {cardLabel(card)}
                          </button>
                        </h3>
                        {tagged ? null : menu}
                      </div>
                      <KanbanCardBody
                        card={card}
                        assignee={
                          card.AssigneeUserId
                            ? (assigneeNames.get(card.AssigneeUserId) ?? U.assignee)
                            : null
                        }
                      />
                    </article>
                  );
                })}
              </div>
              {!planning && canCreate ? (
                <button
                  type="button"
                  className="mx-3 mb-2 min-h-8 cursor-pointer self-start rounded-md px-2 text-sm font-semibold text-accent hover:bg-surface-raised disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setNewColumn(lane.id)}
                >
                  <span aria-hidden="true">+ </span>
                  {U.newCard}
                </button>
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
          projects={projects}
          canEdit={canEdit}
          canEditRequirements={rowAllows("requirements:update")(board.header)}
          onCardChange={setEditing}
          onChanged={() => {
            sheetChanged.current = true;
          }}
          close={() => {
            setEditing(null);
            setNewColumn(null);
            if (sheetChanged.current) router.refresh();
            sheetChanged.current = false;
          }}
        />
      ) : null}
      {moving ? (
        <CardMoveDialog
          board={board}
          card={moving}
          close={() => setMoving(null)}
          onMoved={() => {
            refocus.current = moving.BoardCardId;
          }}
        />
      ) : null}
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
