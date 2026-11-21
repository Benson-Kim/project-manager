"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { PANEL_SHELL } from "@/components/ui/panel-styles";
import type { WorkspaceActionItem } from "../schemas/meeting";
import { isOverdue, itemName } from "../schemas/minutes";
import { ActionLogLinks } from "./action-log-links";
import { ActionTaskLinks } from "./action-task-links";
import { useMinutes } from "./minutes-context";
import { ActionItemForm } from "./minutes-forms";
import { ActionStatusCell, OverdueBadge } from "./minutes-tree";

const M = messages.meetings;

const thStyle = "px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-muted";
const tdStyle = "px-3.5 py-3 align-middle text-sm";

function ActionItemRow({ action, index }: { action: WorkspaceActionItem; index: number }) {
  const { canEdit, focusSoon, today } = useMinutes();
  const [editing, setEditing] = useState(false);
  const id = action.MeetingActionItemId;
  const key = `action-table-${id}`;
  const name = itemName(action.Action, M.action);
  const overdue = isOverdue(action.DueDate, today) && action.Status !== "completed";
  const isCompleted = action.Status === "completed";

  if (editing) {
    return (
      <tr data-testid="action-table-row" className="bg-surface-raised/40">
        <td colSpan={6} className={tdStyle}>
          <ActionItemForm
            action={action}
            onDone={() => {
              setEditing(false);
              focusSoon(`${key}-edit`);
            }}
          />
        </td>
      </tr>
    );
  }

  // Row status indicator styling matching prototype
  const borderTone = isCompleted
    ? "border-l-4 border-l-success/60 bg-surface/50 opacity-80"
    : overdue
      ? "border-l-4 border-l-danger bg-danger-soft/10"
      : action.Status === "on-hold"
        ? "border-l-4 border-l-warning bg-warning-soft/10"
        : "border-l-4 border-l-transparent hover:border-l-accent hover:bg-surface-raised/40";

  return (
    <tr data-testid="action-table-row" className={`group transition-colors ${borderTone}`}>
      {/* Index */}
      <td className={`${tdStyle} w-10 text-center font-mono text-xs text-ink-muted`}>
        {isCompleted ? (
          <span className="font-semibold text-success">✓{index + 1}</span>
        ) : (
          <span>{index + 1}</span>
        )}
      </td>

      {/* Action & Edit */}
      <td className={`${tdStyle} min-w-56 text-ink wrap-anywhere`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={isCompleted ? "text-ink-muted line-through" : "font-medium text-ink"}>
              {action.Action}
            </span>
            {action.Status === "on-hold" && action.OnHoldReason ? (
              <span className="text-xs text-ink-muted italic">
                Hold reason: {action.OnHoldReason}
              </span>
            ) : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              data-focus-key={`${key}-edit`}
              aria-label={M.editItem(name)}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-raised hover:text-ink transition-colors border border-transparent hover:border-line print:hidden"
              onClick={() => setEditing(true)}
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              <span>{messages.actions.edit}</span>
            </button>
          ) : null}
        </div>
      </td>

      {/* Owner / Assignee */}
      <td className={`${tdStyle} w-44 text-ink-muted`}>
        {action.AssigneeName ? (
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink-muted border border-line">
              {action.AssigneeName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-sm text-ink">{action.AssigneeName}</span>
          </div>
        ) : (
          <span className="text-xs italic text-ink-muted">Unassigned</span>
        )}
      </td>

      {/* Due Date & Overdue Badge */}
      <td className={`${tdStyle} w-36 whitespace-nowrap tabular-nums text-ink-muted`}>
        {action.DueDate ? (
          <div className="flex items-center gap-2">
            <span className={overdue ? "font-semibold text-danger" : "text-ink"}>
              {formatDate(action.DueDate)}
            </span>
            {overdue ? <OverdueBadge /> : null}
          </div>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        )}
      </td>

      {/* Status */}
      <td className={`${tdStyle} w-40`}>
        <ActionStatusCell action={action} name={name} />
      </td>

      {/* Links (Governance & WBS Tasks) */}
      <td className={`${tdStyle} w-52`}>
        <div className="flex flex-col gap-1.5">
          <ActionLogLinks action={action} name={name} />
          <ActionTaskLinks action={action} name={name} />
        </div>
      </td>
    </tr>
  );
}

/** Every action raised in this meeting, displayed in a clean card matching the project overview. */
export function ActionItemsTable({ actions }: { actions: WorkspaceActionItem[] }) {
  const { today } = useMinutes();

  const openCount = actions.filter((a) => a.Status !== "completed").length;
  const doneCount = actions.filter((a) => a.Status === "completed").length;
  const overdueCount = actions.filter(
    (a) => a.Status !== "completed" && isOverdue(a.DueDate, today),
  ).length;

  return (
    <section
      aria-labelledby="action-items-heading"
      data-testid="action-items-table"
      className={PANEL_SHELL}
    >
      {/* Header bar matching Project Overview */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <h3 id="action-items-heading" className="text-base font-semibold text-ink">
            {M.actionItems}
          </h3>
          {actions.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
              {actions.length}
            </span>
          )}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span>{openCount} open</span>
            </span>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1 font-medium text-danger">
                <span className="h-2 w-2 rounded-full bg-danger" />
                <span>{M.overdueCount(overdueCount)}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span>{doneCount} completed</span>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-ink-muted border border-line">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">{M.noActionItems}</p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Actions raised under agenda topics or discussion points will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-sunken/60 text-left border-b border-line">
              <tr>
                <th scope="col" className={`${thStyle} w-10 text-center`}>
                  #
                </th>
                <th scope="col" className={thStyle}>
                  {M.action}
                </th>
                <th scope="col" className={`${thStyle} w-44`}>
                  {M.personResponsible}
                </th>
                <th scope="col" className={`${thStyle} w-36`}>
                  {M.dueDate}
                </th>
                <th scope="col" className={`${thStyle} w-40`}>
                  {M.status}
                </th>
                <th scope="col" className={`${thStyle} w-52`}>
                  {M.logIn}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {actions.map((action, index) => (
                <ActionItemRow key={action.MeetingActionItemId} action={action} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
