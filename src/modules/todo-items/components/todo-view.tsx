"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { dateColumn, listColumn, textColumn } from "@/components/ui/data-view/columns";
import { DataView } from "@/components/ui/data-view/data-view";
import { formCellSaver } from "@/components/ui/data-view/datasheet";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { EmptyState } from "@/components/ui/states";
import { rowAllows } from "@/lib/auth/actor-access";
import type { ViewMode } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { formatDate } from "@/lib/format";
import {
  isApproachingDeadline,
  isOverdue,
  type TodoItemListRow,
  type TodoItemRow,
} from "../schemas/todo-item";
import { todoItemFormValues } from "../schemas/todo-item-form";
import { createTodoItemAction, reorderTodoItemAction, updateTodoItemAction } from "../actions";
import { TodoToolbar } from "./todo-toolbar";

type Row = TodoItemListRow;
const P = messages.todoItems.placeholders;

/** Due-date emphasis: overdue (danger) or approaching (warning) — design tokens only. */
function dueTone(row: Row): string | undefined {
  if (isOverdue(row)) return "font-semibold text-danger";
  if (isApproachingDeadline(row)) return "font-semibold text-warning";
  return undefined;
}

/** Up/down reorder buttons rendered inside the DataView card/row (list view only). */
function ReorderControls({
  row,
  rows,
  canReorder,
}: {
  row: Row;
  rows: Row[];
  canReorder: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canReorder || rows.length < 2) return null;

  const idx = rows.findIndex((r) => r.TodoItemId === row.TodoItemId);
  const isFirst = idx === 0;
  const isLast = idx === rows.length - 1;

  const move = (targetIdx: number) => {
    const target = rows[targetIdx];
    if (!target) return;
    startTransition(async () => {
      await reorderTodoItemAction({
        todoItemId: row.TodoItemId,
        newSortKey: target.SortKey,
        rowVer: row.RowVer,
      });
      router.refresh();
    });
  };

  return (
    <div className="ml-auto flex shrink-0 flex-col" aria-label={messages.todoItems.reorderLabel}>
      <button
        type="button"
        disabled={isFirst || pending}
        onClick={(e) => {
          e.stopPropagation();
          move(idx - 1);
        }}
        aria-label={messages.todoItems.moveUp}
        className="flex size-11 items-center justify-center rounded text-xs text-ink-muted hover:bg-surface-raised disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        disabled={isLast || pending}
        onClick={(e) => {
          e.stopPropagation();
          move(idx + 1);
        }}
        aria-label={messages.todoItems.moveDown}
        className="flex size-11 items-center justify-center rounded text-xs text-ink-muted hover:bg-surface-raised disabled:opacity-30"
      >
        ▼
      </button>
    </div>
  );
}

function buildColumns(rows: Row[], canReorder: boolean): DataViewColumn<Row>[] {
  return [
    textColumn({
      key: "TodoItem",
      header: messages.todoItems.todoItem,
      priority: 1,
      field: "todoItem",
      value: (r) => r.TodoItem,
      placeholder: P.todoItem,
      maxLength: 255,
    }),
    listColumn({
      key: "Status",
      header: messages.todoItems.status,
      priority: 1,
      field: "status",
      list: "todo-item.status",
      value: (r) => r.Status,
      placeholder: P.status,
    }),
    listColumn({
      key: "Priority",
      header: messages.todoItems.priority,
      priority: 1,
      field: "priority",
      list: "todo-item.priority",
      value: (r) => r.Priority,
      placeholder: P.priority,
    }),
    dateColumn({
      key: "DueDate",
      header: messages.todoItems.dueDate,
      priority: 2,
      field: "dueDate",
      value: (r) => r.DueDate,
      placeholder: P.dueDate,
      render: (r) => (
        <span className={dueTone(r)}>
          {formatDate(r.DueDate) || messages.todoItems.noDueDate}
          {isOverdue(r) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full border border-danger bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
              {messages.todoItems.overdue}
            </span>
          ) : isApproachingDeadline(r) ? (
            <span className="ml-1.5 inline-flex items-center rounded-full border border-warning bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
              {messages.todoItems.approachingDeadline}
            </span>
          ) : null}
        </span>
      ),
    }),
    dateColumn({
      key: "StartDate",
      header: messages.todoItems.startDate,
      priority: 3,
      field: "startDate",
      value: (r) => r.StartDate,
      placeholder: P.startDate,
    }),
    {
      key: "ProjectOrActivity",
      header: messages.todoItems.projectOrActivity,
      priority: 3,
      render: (r) => <Badge value={r.ProjectOrActivity} />,
    },
    {
      key: "Reorder",
      header: messages.todoItems.reorderLabel,
      priority: 2,
      render: (r) => <ReorderControls row={r} rows={rows} canReorder={canReorder} />,
    },
  ];
}

/** Datasheet edits go through the same update action as the Sheet (ADR-0023). */
const saveCell = formCellSaver<Row, TodoItemRow>(todoItemFormValues, updateTodoItemAction);
/** The to-do rule per row (ADR-0021): own to-dos, or every to-do of projects you manage. */
const canEditRow = rowAllows("todo-items:update");

/**
 * To-do list: DataView with TodoToolbar; opening a row syncs ?id=. List view is
 * a datasheet (ADR-0023): editable cells per the row's ActorAccess and a
 * new-entry row (this project's to-dos, or personal ones on /todo).
 */
export function TodoView({
  rows,
  totalCount,
  page,
  initialView,
  filtersActive,
  projectId,
  canCreate,
  canReorder = false,
  newTodoAction,
  emptyBody,
}: {
  rows: Row[];
  totalCount: number;
  page: number;
  initialView: ViewMode;
  filtersActive: boolean;
  /** The project the new-entry row adds to; null on /todo (personal to-dos). */
  projectId: number | null;
  canCreate: boolean;
  canReorder?: boolean;
  newTodoAction?: React.ReactNode;
  emptyBody?: string;
}) {
  const { update } = useListUrlState();
  const columns = buildColumns(rows, canReorder);

  return (
    <DataView
      moduleKey="todo-items"
      rows={rows}
      totalCount={totalCount}
      page={page}
      initialView={initialView}
      getRowId={(row) => row.TodoItemId}
      getRowLabel={(row) => row.TodoItem ?? messages.app.untitled}
      onOpen={(row) => update({ id: String(row.TodoItemId) })}
      renderToolbar={(viewToggle) => <TodoToolbar>{viewToggle}</TodoToolbar>}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{row.TodoItem ?? messages.app.untitled}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge value={row.Status} />
            <Badge value={row.Priority} />
          </div>
          {row.DueDate ? (
            <p className={`text-xs ${dueTone(row) ?? "text-ink-muted"}`}>
              {formatDate(row.DueDate)}
              {isOverdue(row)
                ? ` — ${messages.todoItems.overdue}`
                : isApproachingDeadline(row)
                  ? ` — ${messages.todoItems.approachingDeadline}`
                  : ""}
            </p>
          ) : null}
          {canReorder ? <ReorderControls row={row} rows={rows} canReorder={canReorder} /> : null}
        </div>
      )}
      columns={columns}
      datasheet={{
        canEditRow,
        saveCell,
        addRow: canCreate
          ? {
              add: (values) =>
                createTodoItemAction({
                  ...values,
                  projectId: projectId === null ? "" : String(projectId),
                }),
            }
          : undefined,
      }}
      empty={
        filtersActive ? (
          <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
        ) : (
          <EmptyState
            title={messages.list.emptyTitle}
            body={emptyBody ?? messages.todoItems.emptyBody}
            action={newTodoAction}
          />
        )
      }
    />
  );
}
