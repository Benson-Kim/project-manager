"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { previewText, type RichCellView } from "@/components/ui/data-view/datasheet";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  deleteActionItemAction,
  deleteAgendaItemAction,
  deleteDiscussionPointAction,
  deleteFollowUpAction,
  reorderActionItemsAction,
  reorderAgendaItemsAction,
  reorderDiscussionPointsAction,
  reorderFollowUpsAction,
  setActionItemStatusAction,
} from "../actions";
import type {
  ActionStatus,
  MeetingWorkspace,
  RosterEntry,
  WorkspaceDiscussionPoint,
} from "../schemas/meeting";
import {
  agendaSiblings,
  buildMinutes,
  carriedOverActions,
  itemName,
  moveOrder,
  openActions,
  personOptions,
  type Sibling,
} from "../schemas/minutes";
import {
  MinutesContext,
  type DeleteTarget,
  type MinutesAnswer,
  type MinutesContextValue,
  type MoveRequest,
  type PickedPerson,
} from "./minutes-context";
import { AgendaItemForm, OnHoldReasonDialog } from "./minutes-forms";
import { ActionStatusCell, AgendaBlock, OverdueBadge } from "./minutes-tree";

const M = messages.meetings;

function requestReorder(
  meetingId: number,
  request: MoveRequest,
  order: Sibling[],
): Promise<MinutesAnswer> {
  if (request.kind === "agenda") return reorderAgendaItemsAction({ meetingId, order });
  if (request.kind === "point") {
    return reorderDiscussionPointsAction({ agendaItemId: request.agendaItemId, order });
  }
  if (request.kind === "followUp") {
    return reorderFollowUpsAction({ meetingActionItemId: request.meetingActionItemId, order });
  }
  return reorderActionItemsAction(
    request.discussionPointId == null
      ? { agendaItemId: request.agendaItemId, order }
      : { discussionPointId: request.discussionPointId, order },
  );
}

function requestDelete(target: DeleteTarget): Promise<MinutesAnswer> {
  const { id, rowVer } = target;
  if (target.kind === "agenda") return deleteAgendaItemAction({ meetingAgendaItemId: id, rowVer });
  if (target.kind === "point") {
    return deleteDiscussionPointAction({ meetingDiscussionPointId: id, rowVer });
  }
  if (target.kind === "followUp") {
    return deleteFollowUpAction({ meetingActionFollowUpId: id, rowVer });
  }
  return deleteActionItemAction({ meetingActionItemId: id, rowVer });
}

const ENTITY = {
  agenda: M.agendaEntity,
  point: M.pointEntity,
  action: M.actionEntity,
  followUp: M.followUpEntity,
} as const;
const DELETE_BODY = {
  agenda: M.deleteAgendaBody,
  point: M.deletePointBody,
  action: messages.confirmDelete.body,
  followUp: messages.confirmDelete.body,
} as const;

/**
 * The meeting's minutes (ADR-0028, checklist rows 12, 13, 72): the agenda in
 * order, each item's discussion points (rich text) and the actions under a
 * point or directly under the item, with the person responsible chosen from
 * the project's stakeholders. Every level adds, edits inline, deletes behind
 * a confirmation and moves up or down from the keyboard. Each change answers
 * with the whole workspace, which replaces what is shown unless a newer read
 * already arrived; a stale RowVer is a CONFLICT with Reload. The open actions
 * sit on top, the overdue ones marked.
 */
export function MinutesEditor({
  workspace,
  pointViews,
  roster,
  today,
  meetingsHref,
  canCreate,
  canEdit,
  canDelete,
}: {
  workspace: MeetingWorkspace;
  /** Each discussion point's formatted view, rendered on the server (RichTextView). */
  pointViews: Record<number, RichCellView>;
  roster: RosterEntry[];
  today: string;
  /** The project's meetings list route; a carried-over action links to its own meeting under it. */
  meetingsHref: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { announce } = useAnnouncer();
  const meetingId = workspace.meeting.MeetingId;

  const [shown, setShown] = useState(workspace);
  const [seen, setSeen] = useState(workspace);
  // A page refresh brings the workspace again: taken unless older than the last answer.
  if (workspace !== seen) {
    setSeen(workspace);
    if (workspace.stamp >= shown.stamp) setShown(workspace);
  }

  const [busy, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  /** The action whose hold is being given a reason (ADR-0042). */
  const [holding, setHolding] = useState<{
    id: number;
    rowVer: number;
    name: string;
    current: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ key: string } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    document
      .querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusTarget.key)}"]`)
      ?.focus();
  }, [focusTarget]);

  const tree = useMemo(() => buildMinutes(shown), [shown]);
  const open = useMemo(() => openActions(shown.actionItems, today), [shown, today]);
  const overdue = open.filter((o) => o.overdue).length;
  const carried = useMemo(() => carriedOverActions(shown.carriedOver, today), [shown, today]);

  const answer = useCallback(
    (next: MeetingWorkspace | null, refresh = false) => {
      if (next) setShown((current) => (next.stamp >= current.stamp ? next : current));
      if (!next || refresh) router.refresh();
    },
    [router],
  );

  const fail = useCallback(
    (error: { code: string; message: string }) => {
      if (error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
        return;
      }
      setFailure({
        message: error.message,
        stale: error.code === "CONFLICT" || error.code === "NOT_FOUND",
      });
    },
    [router],
  );

  const focusSoon = useCallback((key: string) => setFocusTarget({ key }), []);

  const move = useCallback(
    (request: MoveRequest, siblings: Sibling[], id: number, step: -1 | 1, key: string) => {
      if (busy) return;
      const order = moveOrder(siblings, id, step);
      if (!order) return;
      setFailure(null);
      startTransition(async () => {
        const result = await requestReorder(meetingId, request, order);
        if (!result.ok) {
          fail(result.error);
          return;
        }
        answer(result.data);
        const position = order.findIndex((s) => s.id === id) + 1;
        const atEnd = step === -1 ? position === 1 : position === order.length;
        const along = step === -1 ? "up" : "down";
        const back = step === -1 ? "down" : "up";
        focusSoon(`${key}-${atEnd ? back : along}`);
        announce(M.moved(position, order.length));
      });
    },
    [busy, meetingId, answer, fail, focusSoon, announce],
  );

  const confirmDelete = () => {
    if (!target) return;
    setFailure(null);
    startTransition(async () => {
      const result = await requestDelete(target);
      setConfirming(false);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      answer(result.data);
      focusSoon("agenda-heading");
      announce(messages.feedback.deleted);
    });
  };

  const people = useCallback((current?: PickedPerson) => personOptions(roster, current), [roster]);

  /**
   * Ticking an action off, from its own row or from the carried-over list,
   * where the action belongs to an earlier meeting. The proc takes the status
   * alone, so a reader who never saw the action's text cannot overwrite it.
   */
  const writeStatus = useCallback(
    (id: number, rowVer: number, status: ActionStatus, name: string, reason: string | null) => {
      if (busy) return;
      setFailure(null);
      startTransition(async () => {
        const result = await setActionItemStatusAction({
          meetingActionItemId: id,
          rowVer,
          status,
          onHoldReason: reason,
        });
        if (!result.ok) {
          fail(result.error);
          return;
        }
        // A carried-over action lives in another meeting, so this workspace's
        // own rows did not change: refresh to read the carry-over list again.
        answer(result.data, true);
        announce(M.statusSet(name, M.actionStatus[status]));
      });
    },
    [busy, answer, fail, announce],
  );

  /**
   * The hold asks for its reason before anything is written, so the status and
   * the reason reach the proc in one call — the pair the table allows. Every
   * other status writes straight away and clears whatever reason was there.
   */
  const setStatus = useCallback(
    (id: number, rowVer: number, status: ActionStatus, name: string, current?: string | null) => {
      if (busy) return;
      if (status === "on-hold") {
        setHolding({ id, rowVer, name, current: current ?? null });
        return;
      }
      writeStatus(id, rowVer, status, name, null);
    },
    [busy, writeStatus],
  );

  // The server's formatted view while it matches; plain text until a refresh brings the new one.
  const pointView = useCallback(
    (point: WorkspaceDiscussionPoint) => {
      const view = pointViews[point.MeetingDiscussionPointId];
      if (view && view.html === point.DiscussionPoint) return view.node;
      return <p>{previewText(point.DiscussionPoint)}</p>;
    },
    [pointViews],
  );

  const context: MinutesContextValue = {
    meetingId,
    canCreate,
    canEdit,
    canDelete,
    busy,
    answer,
    move,
    askDelete: (next: DeleteTarget) => {
      setTarget(next);
      setConfirming(true);
    },
    focusSoon,
    pointView,
    people,
    setStatus,
    today,
  };

  const siblings = agendaSiblings(tree);

  return (
    <MinutesContext.Provider value={context}>
      <div className="flex flex-col gap-6" data-testid="minutes">
        <section
          aria-labelledby="open-actions-heading"
          data-testid="open-actions"
          className="flex flex-col gap-2 rounded-md border border-line p-4"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id="open-actions-heading" className="text-sm font-medium text-ink">
              {M.openActions}
            </h3>
            {overdue > 0 ? (
              <p className="text-sm text-danger" data-testid="overdue-count">
                {M.overdueCount(overdue)}
              </p>
            ) : null}
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-ink-muted">{M.noOpenActions}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {open.map(({ action, overdue: late }) => (
                <li
                  key={action.MeetingActionItemId}
                  data-testid="open-action"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 text-ink wrap-anywhere">{action.Action}</span>
                  {action.AssigneeName ? (
                    <span className="text-ink-muted">{action.AssigneeName}</span>
                  ) : null}
                  {action.DueDate ? (
                    <span className="text-ink-muted tabular-nums">
                      {formatDate(action.DueDate)}
                    </span>
                  ) : null}
                  {late ? <OverdueBadge /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="carried-over-heading"
          data-testid="carried-over"
          className="flex flex-col gap-2 rounded-md border border-line p-4"
        >
          <div className="flex flex-col gap-0.5">
            <h3 id="carried-over-heading" className="text-sm font-medium text-ink">
              {M.carriedOver}
            </h3>
            <p className="text-xs text-ink-muted">{M.carriedOverHint}</p>
          </div>
          {carried.length === 0 ? (
            <p className="text-sm text-ink-muted">{M.noCarriedOver}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {carried.map(({ action, overdue: late }) => {
                const name = itemName(action.Action, M.action);
                return (
                  <li
                    key={action.MeetingActionItemId}
                    data-testid="carried-over-action"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-ink wrap-anywhere">{action.Action}</span>
                    {action.AssigneeName ? (
                      <span className="text-ink-muted">{action.AssigneeName}</span>
                    ) : null}
                    {action.DueDate ? (
                      <span className="text-ink-muted tabular-nums">
                        {formatDate(action.DueDate)}
                      </span>
                    ) : null}
                    {late ? <OverdueBadge /> : null}
                    <Link
                      href={`${meetingsHref}/${action.FromMeetingId}`}
                      aria-label={M.openCarriedMeeting(action.FromSubject ?? messages.app.untitled)}
                      className="text-ink-muted underline print:no-underline"
                    >
                      {M.carriedFrom(action.FromSubject ?? messages.app.untitled)}
                    </Link>
                    <ActionStatusCell action={action} name={name} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="agenda-heading" className="flex flex-col gap-3">
          <h3
            id="agenda-heading"
            tabIndex={-1}
            data-focus-key="agenda-heading"
            className="text-sm font-medium text-ink focus:outline-none"
          >
            {M.agenda}
          </h3>
          {failure ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
            >
              <p>{failure.message}</p>
              {failure.stale ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setFailure(null);
                      router.refresh();
                    }}
                  >
                    {M.reload}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {tree.length === 0 ? (
            <p className="text-sm text-ink-muted">{M.noAgenda}</p>
          ) : (
            <ol aria-label={M.agenda} className="flex flex-col gap-4">
              {tree.map((node, index) => (
                <AgendaBlock
                  key={node.item.MeetingAgendaItemId}
                  node={node}
                  position={index + 1}
                  siblings={siblings}
                />
              ))}
            </ol>
          )}
          {canCreate ? (
            adding ? (
              <AgendaItemForm
                onDone={() => {
                  setAdding(false);
                  focusSoon("agenda-add");
                }}
              />
            ) : (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  data-focus-key="agenda-add"
                  onClick={() => setAdding(true)}
                >
                  {M.addAgendaItem}
                </Button>
              </div>
            )
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={target ? messages.confirmDelete.title(ENTITY[target.kind], target.name) : ""}
        body={target ? DELETE_BODY[target.kind] : ""}
        confirmLabel={messages.actions.delete}
        onConfirm={confirmDelete}
        pending={busy}
      />

      {holding ? (
        <OnHoldReasonDialog
          // Each action brings its own reason into the dialog's state.
          key={holding.id}
          open
          actionName={holding.name}
          current={holding.current}
          pending={busy}
          onCancel={() => setHolding(null)}
          onConfirm={(reason) => {
            setHolding(null);
            writeStatus(holding.id, holding.rowVer, "on-hold", holding.name, reason);
          }}
        />
      ) : null}
    </MinutesContext.Provider>
  );
}
