"use client";

import { useState } from "react";
import { previewText } from "@/components/ui/data-view/datasheet";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { ActionStatus, WorkspaceFollowUp } from "../schemas/meeting";
import {
  actionSiblings,
  followUpSiblings,
  isOverdue,
  itemName,
  pointSiblings,
  type ActionNode,
  type AgendaNode,
  type PointNode,
  type Sibling,
} from "../schemas/minutes";
import { useMinutes, type DeleteTarget, type MoveRequest } from "./minutes-context";
import {
  ActionItemForm,
  AgendaItemForm,
  DiscussionPointForm,
  FollowUpForm,
  StatusSelect,
} from "./minutes-forms";

const M = messages.meetings;

const textButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-3 text-sm font-medium " +
  "hover:bg-surface-raised aria-disabled:cursor-default aria-disabled:opacity-50";

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-danger bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
      {M.overdue}
    </span>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
      <path d={up ? "M8 3l5 6H3z" : "M8 13l5-6H3z"} />
    </svg>
  );
}

/**
 * An item's Edit, Move up, Move down and Delete. Each names the item, and
 * each move button keeps focus through the move (data-focus-key). Moves and
 * deletes wait while another is on its way; the buttons stay focusable.
 */
function ItemControls({
  name,
  focusKey,
  id,
  siblings,
  request,
  remove,
  onEdit,
}: {
  name: string;
  focusKey: string;
  id: number;
  siblings: Sibling[];
  request: MoveRequest;
  remove: Omit<DeleteTarget, "name">;
  onEdit: () => void;
}) {
  const { canEdit, canDelete, busy, move, askDelete } = useMinutes();
  if (!canEdit && !canDelete) return null;
  const index = siblings.findIndex((s) => s.id === id);
  const movable = canEdit && siblings.length > 1;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 print:hidden">
      {canEdit ? (
        <button
          type="button"
          data-focus-key={`${focusKey}-edit`}
          aria-label={M.editItem(name)}
          className={`${textButton} text-ink`}
          onClick={onEdit}
        >
          {messages.actions.edit}
        </button>
      ) : null}
      {movable ? (
        <>
          <button
            type="button"
            data-focus-key={`${focusKey}-up`}
            aria-label={M.moveUp(name)}
            disabled={index === 0}
            aria-disabled={busy || undefined}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised disabled:cursor-default disabled:opacity-40 aria-disabled:opacity-50"
            onClick={() => move(request, siblings, id, -1, focusKey)}
          >
            <Arrow up />
          </button>
          <button
            type="button"
            data-focus-key={`${focusKey}-down`}
            aria-label={M.moveDown(name)}
            disabled={index === siblings.length - 1}
            aria-disabled={busy || undefined}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised disabled:cursor-default disabled:opacity-40 aria-disabled:opacity-50"
            onClick={() => move(request, siblings, id, 1, focusKey)}
          >
            <Arrow up={false} />
          </button>
        </>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          aria-label={M.deleteItem(name)}
          aria-disabled={busy || undefined}
          className={`${textButton} text-danger`}
          onClick={() => {
            if (!busy) askDelete({ ...remove, name });
          }}
        >
          {messages.actions.delete}
        </button>
      ) : null}
    </div>
  );
}

/** "Add …" under a parent; its form takes its place while open. */
function AddButton({
  label,
  name,
  focusKey,
  onClick,
}: {
  label: string;
  /** The accessible name: the label and what it adds to. */
  name: string;
  focusKey: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      data-focus-key={focusKey}
      className={`${textButton} self-start border border-dashed border-line text-ink print:hidden`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** A status pill; the completed one is quiet, since a done action needs no attention. */
export function StatusBadge({ status }: { status: ActionStatus }) {
  const tone =
    status === "completed"
      ? "border-line bg-surface-raised text-ink-muted"
      : status === "on-hold"
        ? "border-warning bg-warning-soft text-ink"
        : "border-accent bg-accent-soft text-ink";
  return (
    <span
      data-testid="action-status-badge"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {M.actionStatus[status]}
    </span>
  );
}

/** One follow-up of an action: its text, who it is assigned to and its two dates. */
function FollowUpRow({
  followUp,
  siblings,
  request,
}: {
  followUp: WorkspaceFollowUp;
  siblings: Sibling[];
  request: MoveRequest;
}) {
  const { focusSoon, today } = useMinutes();
  const [editing, setEditing] = useState(false);
  const id = followUp.MeetingActionFollowUpId;
  const key = `follow-up-${id}`;
  const name = itemName(followUp.FollowUp, M.followUpEntity);
  const overdue = isOverdue(followUp.DueDate, today);

  return (
    <li data-testid="follow-up" className="flex flex-col gap-1 border-l border-line pl-3">
      {editing ? (
        <FollowUpForm
          meetingActionItemId={followUp.MeetingActionItemId}
          followUp={followUp}
          onDone={() => {
            setEditing(false);
            focusSoon(`${key}-edit`);
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 py-2.5 text-sm text-ink wrap-anywhere">
              {followUp.FollowUp}
            </p>
            <ItemControls
              name={name}
              focusKey={key}
              id={id}
              siblings={siblings}
              request={request}
              remove={{ kind: "followUp", id, rowVer: followUp.RowVer }}
              onEdit={() => setEditing(true)}
            />
          </div>
          <PersonAndDates
            assignee={followUp.AssigneeName}
            assigneeLabel={M.assignedTo}
            dueDate={followUp.DueDate}
            overdue={overdue}
            followUpDate={followUp.FollowUpDate}
          />
        </>
      )}
    </li>
  );
}

/** The person and date line shared by an action and its follow-ups. */
function PersonAndDates({
  assignee,
  assigneeLabel,
  dueDate,
  overdue,
  followUpDate,
}: {
  assignee: string | null;
  assigneeLabel: string;
  dueDate: string | null;
  overdue: boolean;
  followUpDate?: string | null;
}) {
  if (!assignee && !dueDate && !followUpDate) return null;
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
      {assignee ? (
        <div className="flex gap-1">
          <dt>{assigneeLabel}:</dt>
          <dd className="text-ink">{assignee}</dd>
        </div>
      ) : null}
      {followUpDate ? (
        <div className="flex gap-1">
          <dt>{M.followUpDate}:</dt>
          <dd className="text-ink tabular-nums">{formatDate(followUpDate)}</dd>
        </div>
      ) : null}
      {dueDate ? (
        <div className="flex items-center gap-1">
          <dt>{M.dueDate}:</dt>
          <dd className="flex items-center gap-2 text-ink tabular-nums">
            {formatDate(dueDate)}
            {overdue ? <OverdueBadge /> : null}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** An action's follow-ups, with their Add button (ADR-0041). */
function FollowUpList({ node, actionName }: { node: ActionNode; actionName: string }) {
  const { canCreate, focusSoon } = useMinutes();
  const [adding, setAdding] = useState(false);
  const id = node.action.MeetingActionItemId;
  const siblings = followUpSiblings(node.followUps);
  const request: MoveRequest = { kind: "followUp", meetingActionItemId: id };
  const addKey = `follow-up-add-${id}`;

  if (!canCreate && node.followUps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pt-1">
      {node.followUps.length > 0 ? (
        <ul aria-label={M.followUpsOf(actionName)} className="flex flex-col gap-2">
          {node.followUps.map((followUp) => (
            <FollowUpRow
              key={followUp.MeetingActionFollowUpId}
              followUp={followUp}
              siblings={siblings}
              request={request}
            />
          ))}
        </ul>
      ) : null}
      {canCreate ? (
        adding ? (
          <FollowUpForm
            meetingActionItemId={id}
            onDone={() => {
              setAdding(false);
              focusSoon(addKey);
            }}
          />
        ) : (
          <AddButton
            label={M.addFollowUp}
            name={M.addFollowUpTo(actionName)}
            focusKey={addKey}
            onClick={() => setAdding(true)}
          />
        )
      ) : null}
    </div>
  );
}

function ActionRow({
  node,
  siblings,
  request,
}: {
  node: ActionNode;
  siblings: Sibling[];
  request: MoveRequest;
}) {
  const { canEdit, busy, focusSoon, setStatus, today } = useMinutes();
  const [editing, setEditing] = useState(false);
  const action = node.action;
  const id = action.MeetingActionItemId;
  const key = `action-${id}`;
  const name = itemName(action.Action, M.action);
  const overdue = isOverdue(action.DueDate, today);

  return (
    <li
      data-testid="action-item"
      className="flex flex-col gap-1 rounded-md border border-line px-3 py-2"
    >
      {editing ? (
        <ActionItemForm
          action={action}
          onDone={() => {
            setEditing(false);
            focusSoon(`${key}-edit`);
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 py-2.5 text-sm text-ink wrap-anywhere">{action.Action}</p>
            {canEdit ? (
              <div className="w-40 shrink-0 print:hidden">
                <StatusSelect
                  key={action.Status}
                  name={`status-${id}`}
                  ariaLabel={M.setStatusOf(name)}
                  defaultValue={action.Status}
                  onPick={(status) => {
                    if (!busy && status !== action.Status) {
                      setStatus(id, action.RowVer, status, name);
                    }
                  }}
                />
              </div>
            ) : (
              <StatusBadge status={action.Status} />
            )}
            <ItemControls
              name={name}
              focusKey={key}
              id={id}
              siblings={siblings}
              request={request}
              remove={{ kind: "action", id, rowVer: action.RowVer }}
              onEdit={() => setEditing(true)}
            />
          </div>
          {/* The badge repeats the picker's value for print, where the picker is hidden. */}
          {canEdit ? (
            <div className="hidden print:block">
              <StatusBadge status={action.Status} />
            </div>
          ) : null}
          <PersonAndDates
            assignee={action.AssigneeName}
            assigneeLabel={M.personResponsible}
            dueDate={action.DueDate}
            overdue={overdue}
          />
        </>
      )}
      <FollowUpList node={node} actionName={name} />
    </li>
  );
}

/** The actions of one parent, with their Add button. */
function ActionList({
  actions,
  agendaItemId,
  discussionPointId,
  parentName,
}: {
  actions: ActionNode[];
  agendaItemId: number;
  discussionPointId: number | null;
  /** The agenda item or discussion point the actions belong to, for the Add button's name. */
  parentName: string;
}) {
  const { canCreate, focusSoon } = useMinutes();
  const [adding, setAdding] = useState(false);
  const siblings = actionSiblings(actions);
  const request: MoveRequest = { kind: "action", agendaItemId, discussionPointId };
  const addKey = `action-add-${discussionPointId == null ? `a${agendaItemId}` : `p${discussionPointId}`}`;

  return (
    <div className="flex flex-col gap-2">
      {actions.length > 0 ? (
        <ul aria-label={M.actionsOf(parentName)} className="flex flex-col gap-2">
          {actions.map((node) => (
            <ActionRow
              key={node.action.MeetingActionItemId}
              node={node}
              siblings={siblings}
              request={request}
            />
          ))}
        </ul>
      ) : null}
      {canCreate ? (
        adding ? (
          <ActionItemForm
            parent={{ agendaItemId, discussionPointId }}
            onDone={() => {
              setAdding(false);
              focusSoon(addKey);
            }}
          />
        ) : (
          <AddButton
            label={M.addAction}
            name={M.addActionTo(parentName)}
            focusKey={addKey}
            onClick={() => setAdding(true)}
          />
        )
      ) : null}
    </div>
  );
}

function PointBlock({
  node,
  code,
  agendaItemId,
  siblings,
}: {
  node: PointNode;
  code: string;
  agendaItemId: number;
  siblings: Sibling[];
}) {
  const { focusSoon, pointView } = useMinutes();
  const [editing, setEditing] = useState(false);
  const point = node.point;
  const id = point.MeetingDiscussionPointId;
  const key = `point-${id}`;
  const name = itemName(previewText(point.DiscussionPoint), M.discussionPoint);

  return (
    <li data-testid="discussion-point" className="flex flex-col gap-2">
      {editing ? (
        <DiscussionPointForm
          agendaItemId={agendaItemId}
          point={point}
          onDone={() => {
            setEditing(false);
            focusSoon(`${key}-edit`);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-1 gap-2 py-2.5 text-sm text-ink">
            <span className="shrink-0 text-ink-muted tabular-nums">{code}</span>{" "}
            <div className="min-w-0 flex-1 wrap-anywhere">{pointView(point)}</div>
          </div>
          <ItemControls
            name={name}
            focusKey={key}
            id={id}
            siblings={siblings}
            request={{ kind: "point", agendaItemId }}
            remove={{ kind: "point", id, rowVer: point.RowVer }}
            onEdit={() => setEditing(true)}
          />
        </div>
      )}
      <div className="pl-4 sm:pl-6">
        <ActionList
          actions={node.actions}
          agendaItemId={agendaItemId}
          discussionPointId={id}
          parentName={name}
        />
      </div>
    </li>
  );
}

/** One agenda item: its text, its discussion points with their actions, and its own actions. */
export function AgendaBlock({
  node,
  position,
  siblings,
}: {
  node: AgendaNode;
  position: number;
  siblings: Sibling[];
}) {
  const { canCreate, focusSoon } = useMinutes();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const item = node.item;
  const id = item.MeetingAgendaItemId;
  const key = `agenda-${id}`;
  const name = itemName(item.AgendaItem, M.agendaItem);
  const points = pointSiblings(node.points);

  return (
    <li data-testid="agenda-item" className="flex flex-col gap-3 border-t border-line pt-4">
      {editing ? (
        <AgendaItemForm
          item={item}
          onDone={() => {
            setEditing(false);
            focusSoon(`${key}-edit`);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <h4 className="flex min-w-0 flex-1 gap-2 py-2 text-base font-medium text-ink wrap-anywhere">
            <span className="shrink-0 text-ink-muted tabular-nums">{position}.</span>{" "}
            <span className="min-w-0">{item.AgendaItem}</span>
          </h4>
          <ItemControls
            name={name}
            focusKey={key}
            id={id}
            siblings={siblings}
            request={{ kind: "agenda" }}
            remove={{ kind: "agenda", id, rowVer: item.RowVer }}
            onEdit={() => setEditing(true)}
          />
        </div>
      )}
      <div className="flex flex-col gap-3 border-l border-line pl-3 sm:pl-5">
        {node.points.length > 0 ? (
          <ol aria-label={M.discussionPointsOf(name)} className="flex flex-col gap-3">
            {node.points.map((child, index) => (
              <PointBlock
                key={child.point.MeetingDiscussionPointId}
                node={child}
                code={`${position}.${index + 1}`}
                agendaItemId={id}
                siblings={points}
              />
            ))}
          </ol>
        ) : null}
        {canCreate ? (
          adding ? (
            <DiscussionPointForm
              agendaItemId={id}
              onDone={() => {
                setAdding(false);
                focusSoon(`point-add-${id}`);
              }}
            />
          ) : (
            <AddButton
              label={M.addDiscussionPoint}
              name={M.addDiscussionPointTo(name)}
              focusKey={`point-add-${id}`}
              onClick={() => setAdding(true)}
            />
          )
        ) : null}
        <ActionList
          actions={node.actions}
          agendaItemId={id}
          discussionPointId={null}
          parentName={name}
        />
      </div>
    </li>
  );
}
