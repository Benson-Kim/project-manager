"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { WorkspaceActionItem } from "../schemas/meeting";
import { isOverdue, itemName } from "../schemas/minutes";
import { ActionLogLinks } from "./action-log-links";
import { ActionTaskLinks } from "./action-task-links";
import { useMinutes } from "./minutes-context";
import { ActionItemForm } from "./minutes-forms";
import { OverdueBadge } from "./minutes-tree";

const M = messages.meetings;

const cell = "px-3 py-2 align-top text-sm";

function ActionItemRow({ action }: { action: WorkspaceActionItem }) {
  const { canEdit, focusSoon, today } = useMinutes();
  const [editing, setEditing] = useState(false);
  const id = action.MeetingActionItemId;
  const key = `action-table-${id}`;
  const name = itemName(action.Action, M.action);

  if (editing) {
    return (
      <tr data-testid="action-table-row">
        <td colSpan={4} className={cell}>
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

  return (
    <tr data-testid="action-table-row">
      <td className={`${cell} min-w-48 text-ink wrap-anywhere`}>
        <div className="flex items-start justify-between gap-2">
          <span className={action.Status === "completed" ? "text-ink-muted line-through" : ""}>
            {action.Action}
          </span>
          {canEdit ? (
            <button
              type="button"
              data-focus-key={`${key}-edit`}
              aria-label={M.editItem(name)}
              className="shrink-0 rounded-sm px-2 text-sm font-medium text-ink hover:bg-surface-raised print:hidden"
              onClick={() => setEditing(true)}
            >
              {messages.actions.edit}
            </button>
          ) : null}
        </div>
      </td>
      <td className={`${cell} text-ink-muted`}>{action.AssigneeName ?? ""}</td>
      <td className={`${cell} whitespace-nowrap text-ink-muted tabular-nums`}>
        {action.DueDate ? formatDate(action.DueDate) : ""}
        {isOverdue(action.DueDate, today) && action.Status !== "completed" ? (
          <span className="ml-2">
            <OverdueBadge />
          </span>
        ) : null}
      </td>
      <td className={cell}>
        <div className="flex flex-col gap-1.5">
          <ActionLogLinks action={action} name={name} />
          <ActionTaskLinks action={action} name={name} />
        </div>
      </td>
    </tr>
  );
}

/** Every action raised in this meeting, at the foot of the minutes. */
export function ActionItemsTable({ actions }: { actions: WorkspaceActionItem[] }) {
  return (
    <section
      aria-labelledby="action-items-heading"
      data-testid="action-items-table"
      className="flex flex-col gap-2"
    >
      <h3 id="action-items-heading" className="text-sm font-medium text-ink">
        {M.actionItems}
      </h3>
      {actions.length === 0 ? (
        <p className="text-sm text-ink-muted">{M.noActionItems}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse">
            <thead className="bg-surface-sunken text-left text-xs font-medium text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {M.action}
                </th>
                <th scope="col" className="px-3 py-2">
                  {M.personResponsible}
                </th>
                <th scope="col" className="px-3 py-2">
                  {M.dueDate}
                </th>
                <th scope="col" className="px-3 py-2">
                  {M.logIn}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {actions.map((action) => (
                <ActionItemRow key={action.MeetingActionItemId} action={action} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
